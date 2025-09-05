import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp";
import {
  MCPServer,
  MCPTool,
  MCPPrompt,
  MCPResource,
  MCPCallToolResponse,
  GetResourceResponse,
} from "@shared/types";
import { app } from "electron";
import { v4 as uuidv4 } from "uuid";

class MCPService {
  private clients: Map<string, Client> = new Map();
  private activeToolCalls: Map<string, AbortController> = new Map();

  private getServerKey(server: MCPServer): string {
    return JSON.stringify({
      baseUrl: server.baseUrl,
      command: server.command,
      args: Array.isArray(server.args) ? server.args : [],
      env: server.env,
      id: server.id,
    });
  }

  async initClient(server: MCPServer): Promise<Client> {
    const serverKey = this.getServerKey(server);

    // Check if we already have a client
    const existingClient = this.clients.get(serverKey);
    if (existingClient) {
      try {
        await existingClient.ping();
        return existingClient;
      } catch (error) {
        this.clients.delete(serverKey);
      }
    }

    // Create new client
    const client = new Client(
      { name: "MCP Studio", version: app.getVersion() },
      { capabilities: {} },
    );

    // Create transport based on server type
    let transport:
      | StdioClientTransport
      | SSEClientTransport
      | StreamableHTTPClientTransport;

    if (server.baseUrl) {
      if (server.type === "streamableHttp") {
        transport = new StreamableHTTPClientTransport(new URL(server.baseUrl), {
          requestInit: { headers: server.headers || {} },
        });
      } else if (server.type === "sse") {
        transport = new SSEClientTransport(new URL(server.baseUrl), {
          requestInit: { headers: server.headers || {} },
        });
      } else {
        throw new Error("Invalid server type for URL-based connection");
      }
    } else if (server.command) {
      transport = new StdioClientTransport({
        command: server.command,
        args: server.args || [],
        env: { ...process.env, ...(server.env || {}) } as Record<
          string,
          string
        >,
        stderr: "pipe",
      });
    } else {
      throw new Error("Either baseUrl or command must be provided");
    }

    await client.connect(transport);
    this.clients.set(serverKey, client);

    console.log(`Connected to MCP server: ${server.name}`);
    return client;
  }

  async listTools(_: any, server: MCPServer): Promise<MCPTool[]> {
    try {
      const client = await this.initClient(server);
      const { tools } = await client.listTools();

      return tools.map((tool: any) => ({
        id: `${server.name}.${tool.name}`,
        name: tool.name,
        description: tool.description,
        inputSchema: tool.inputSchema,
        serverId: server.id,
        serverName: server.name,
      }));
    } catch (error) {
      console.error(`Failed to list tools for ${server.name}:`, error);
      return [];
    }
  }

  async callTool(
    _: any,
    {
      server,
      name,
      args,
      callId,
    }: {
      server: MCPServer;
      name: string;
      args: any;
      callId?: string;
    },
  ): Promise<MCPCallToolResponse> {
    const toolCallId = callId || uuidv4();
    const abortController = new AbortController();
    this.activeToolCalls.set(toolCallId, abortController);

    try {
      const client = await this.initClient(server);
      const result = await client.callTool(
        { name, arguments: args },
        undefined,
        {
          timeout: server.timeout ? server.timeout * 1000 : 60000,
          signal: abortController.signal,
        },
      );
      return result as MCPCallToolResponse;
    } catch (error) {
      console.error(`Error calling tool ${name}:`, error);
      throw error;
    } finally {
      this.activeToolCalls.delete(toolCallId);
    }
  }

  async listPrompts(_: any, server: MCPServer): Promise<MCPPrompt[]> {
    try {
      const client = await this.initClient(server);
      const { prompts } = await client.listPrompts();

      return prompts.map((prompt: any) => ({
        id: `${server.name}.${prompt.name}`,
        name: prompt.name,
        description: prompt.description,
        arguments: prompt.arguments,
        serverId: server.id,
        serverName: server.name,
      }));
    } catch (error) {
      console.error(`Failed to list prompts for ${server.name}:`, error);
      return [];
    }
  }

  async getPrompt(
    _: any,
    { server, name, args }: { server: MCPServer; name: string; args?: any },
  ) {
    const client = await this.initClient(server);
    return await client.getPrompt({ name, arguments: args });
  }

  async listResources(_: any, server: MCPServer): Promise<MCPResource[]> {
    try {
      const client = await this.initClient(server);
      const result = await client.listResources();
      const resources = result.resources || [];

      return resources.map((resource: any) => ({
        ...resource,
        serverId: server.id,
        serverName: server.name,
      }));
    } catch (error) {
      console.error(`Failed to list resources for ${server.name}:`, error);
      return [];
    }
  }

  async getResource(
    _: any,
    { server, uri }: { server: MCPServer; uri: string },
  ): Promise<GetResourceResponse> {
    const client = await this.initClient(server);
    const result = await client.readResource({ uri });

    const contents =
      result.contents?.map((content: any) => ({
        ...content,
        serverId: server.id,
        serverName: server.name,
      })) || [];

    return { contents };
  }

  async stopServer(_: any, server: MCPServer) {
    const serverKey = this.getServerKey(server);
    const client = this.clients.get(serverKey);
    if (client) {
      await client.close();
      this.clients.delete(serverKey);
      console.log(`Stopped server: ${server.name}`);
    }
  }

  async removeServer(_: any, server: MCPServer) {
    await this.stopServer(_, server);
  }

  async restartServer(_: any, server: MCPServer) {
    await this.stopServer(_, server);
    await this.initClient(server);
  }

  async checkConnectivity(_: any, server: MCPServer): Promise<boolean> {
    try {
      const client = await this.initClient(server);
      await client.listTools();
      return true;
    } catch (error) {
      console.error(`Connectivity check failed for ${server.name}:`, error);
      return false;
    }
  }

  async abortTool(_: any, callId: string): Promise<boolean> {
    const controller = this.activeToolCalls.get(callId);
    if (controller) {
      controller.abort();
      this.activeToolCalls.delete(callId);
      return true;
    }
    return false;
  }

  async cleanup() {
    for (const [key, client] of this.clients) {
      try {
        await client.close();
      } catch (error) {
        console.error(`Failed to close client ${key}:`, error);
      }
    }
    this.clients.clear();
  }
}

export default new MCPService();
