import React, { useState, useEffect } from "react";
import { useSelector, useDispatch } from "react-redux";
import {
  Typography,
  Button,
  Table,
  Switch,
  Space,
  Modal,
  Form,
  Input,
  Select,
  message,
  Popconfirm,
  Tag,
  Tooltip,
  Divider,
} from "antd";
import { Plus, Settings, Trash2, Play, Square, Info } from "lucide-react";
import styled from "styled-components";
import { RootState, store } from "../../store";
import { addServer, updateServer, removeServer } from "../../store/mcpSlice";
import { MCPServer, MCPTool } from "@shared/types";
import { useStorage } from "../../hooks/useStorage";

const { Title } = Typography;
const { TextArea } = Input;

const MCPSettingsPage: React.FC = () => {
  const dispatch = useDispatch();
  const { saveMCPServers } = useStorage();
  const { servers } = useSelector((state: RootState) => state.mcp);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingServer, setEditingServer] = useState<MCPServer | null>(null);
  const [form] = Form.useForm();
  const [connectingServers, setConnectingServers] = useState<Set<string>>(
    new Set(),
  );
  const [serverTools, setServerTools] = useState<Record<string, MCPTool[]>>({});
  const [loadingTools, setLoadingTools] = useState<Set<string>>(new Set());

  const handleAddServer = () => {
    setEditingServer(null);
    form.resetFields();
    setIsModalOpen(true);
  };

  const handleEditServer = (server: MCPServer) => {
    setEditingServer(server);
    form.setFieldsValue({
      ...server,
      args: server.args?.join("\n") || "",
      env: server.env
        ? Object.entries(server.env)
            .map(([k, v]) => `${k}=${v}`)
            .join("\n")
        : "",
      headers: server.headers
        ? Object.entries(server.headers)
            .map(([k, v]) => `${k}=${v}`)
            .join("\n")
        : "",
    });
    setIsModalOpen(true);
  };

  const handleDeleteServer = async (server: MCPServer) => {
    try {
      if (server.isActive) {
        await window.api.mcp.removeServer(server);
      }
      dispatch(removeServer(server.id));
      // Save updated servers after deletion
      const updatedServers = servers.filter((s) => s.id !== server.id);
      await saveMCPServers(updatedServers);
      message.success("Server deleted successfully");
    } catch (error: any) {
      message.error(`Failed to delete server: ${error.message}`);
    }
  };

  const handleToggleServer = async (server: MCPServer, checked: boolean) => {
    const serverId = server.id;
    setConnectingServers((prev) => new Set(prev).add(serverId));

    try {
      const updatedServer = { ...server, isActive: checked };

      if (checked) {
        const isConnected = await window.api.mcp.checkConnectivity(server);
        if (!isConnected) {
          throw new Error("Failed to connect to server");
        }
        // Fetch tools when server starts
        await fetchServerTools(server);
      } else {
        await window.api.mcp.stopServer(server);
        // Clear tools when server stops
        setServerTools((prev) => {
          const next = { ...prev };
          delete next[serverId];
          return next;
        });
      }

      dispatch(updateServer(updatedServer));
      // Save updated servers after status change
      const updatedServers = servers.map((s) =>
        s.id === server.id ? updatedServer : s,
      );
      await saveMCPServers(updatedServers);
      message.success(`Server ${checked ? "started" : "stopped"} successfully`);
    } catch (error: any) {
      message.error(
        `Failed to ${checked ? "start" : "stop"} server: ${error.message}`,
      );
    } finally {
      setConnectingServers((prev) => {
        const next = new Set(prev);
        next.delete(serverId);
        return next;
      });
    }
  };

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields();

      const serverData = {
        name: values.name,
        description: values.description,
        type: values.type,
        baseUrl: values.baseUrl,
        command: values.command,
        args: values.args
          ? values.args.split("\n").filter((arg: string) => arg.trim())
          : [],
        env: values.env ? parseKeyValueString(values.env) : {},
        headers: values.headers ? parseKeyValueString(values.headers) : {},
        isActive: false,
        timeout: values.timeout,
        longRunning: values.longRunning || false,
      };

      if (editingServer) {
        const updatedServer = { ...editingServer, ...serverData };
        dispatch(updateServer(updatedServer));
        // Save updated servers after edit
        const updatedServers = servers.map((s) =>
          s.id === editingServer.id ? updatedServer : s,
        );
        await saveMCPServers(updatedServers);
        message.success("Server updated successfully");
      } else {
        dispatch(addServer(serverData));
        message.success("Server added successfully");

        // Save servers after adding new server (need to get updated state from Redux)
        setTimeout(async () => {
          const currentServers = store.getState().mcp.servers;
          await saveMCPServers(currentServers);
        }, 100);
      }

      setIsModalOpen(false);
      form.resetFields();
    } catch (error: any) {
      console.error("Form validation failed:", error);
    }
  };

  const parseKeyValueString = (str: string): Record<string, string> => {
    const result: Record<string, string> = {};
    str.split("\n").forEach((line) => {
      const [key, ...valueParts] = line.split("=");
      if (key?.trim() && valueParts.length > 0) {
        result[key.trim()] = valueParts.join("=").trim();
      }
    });
    return result;
  };

  const fetchServerTools = async (server: MCPServer) => {
    if (!server.isActive) return;

    const serverId = server.id;
    if (loadingTools.has(serverId) || serverTools[serverId]) return;

    setLoadingTools((prev) => new Set(prev).add(serverId));

    try {
      const tools = await window.api.mcp.listTools(server);
      setServerTools((prev) => ({
        ...prev,
        [serverId]: tools,
      }));
    } catch (error: any) {
      console.error(`Failed to fetch tools for server ${server.name}:`, error);
    } finally {
      setLoadingTools((prev) => {
        const next = new Set(prev);
        next.delete(serverId);
        return next;
      });
    }
  };

  useEffect(() => {
    // Fetch tools for all active servers when component mounts
    servers.forEach((server) => {
      if (server.isActive) {
        fetchServerTools(server);
      }
    });
  }, [servers]);

  const columns = [
    {
      title: "Name",
      dataIndex: "name",
      key: "name",
      render: (name: string, record: MCPServer) => (
        <div>
          <div style={{ fontWeight: 500 }}>{name}</div>
          {record.description && (
            <div style={{ fontSize: "12px", color: "#8c8c8c" }}>
              {record.description}
            </div>
          )}
        </div>
      ),
    },
    {
      title: "Type",
      dataIndex: "type",
      key: "type",
      render: (type: string) => (
        <Tag
          color={
            type === "stdio" ? "blue" : type === "sse" ? "green" : "purple"
          }
        >
          {type.toUpperCase()}
        </Tag>
      ),
    },
    {
      title: "Connection",
      key: "connection",
      render: (_: any, record: MCPServer) => (
        <div style={{ fontSize: "12px", color: "#8c8c8c" }}>
          {record.baseUrl ? record.baseUrl : record.command}
        </div>
      ),
    },
    {
      title: "Status",
      key: "status",
      render: (_: any, record: MCPServer) => (
        <Switch
          checked={record.isActive}
          loading={connectingServers.has(record.id)}
          onChange={(checked) => handleToggleServer(record, checked)}
          checkedChildren={<Play size={12} />}
          unCheckedChildren={<Square size={12} />}
        />
      ),
    },
    {
      title: "Tools",
      key: "tools",
      render: (_: any, record: MCPServer) => {
        const serverId = record.id;
        const tools = serverTools[serverId] || [];
        const isLoading = loadingTools.has(serverId);

        if (!record.isActive) {
          return <span style={{ color: "#999" }}>Inactive</span>;
        }

        if (isLoading) {
          return <span>Loading tools...</span>;
        }

        if (tools.length === 0) {
          return <span style={{ color: "#999" }}>No tools found</span>;
        }

        return (
          <Tooltip
            title={
              <div>
                <div>
                  <strong>Available Tools ({tools.length})</strong>
                </div>
                <Divider style={{ margin: "4px 0" }} />
                {tools.map((tool) => (
                  <div key={tool.id} style={{ marginBottom: "4px" }}>
                    <strong>{tool.name}</strong>
                    {tool.description && (
                      <div style={{ fontSize: "12px", color: "#666" }}>
                        {tool.description}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            }
            placement="topLeft"
          >
            <div>
              <Tag color="green" icon={<Info size={12} />}>
                Active ({tools.length})
              </Tag>
            </div>
          </Tooltip>
        );
      },
    },
    {
      title: "Actions",
      key: "actions",
      render: (_: any, record: MCPServer) => (
        <Space>
          <Button
            type="text"
            size="small"
            icon={<Settings size={14} />}
            onClick={() => handleEditServer(record)}
          />
          <Popconfirm
            title="Delete server?"
            description="This will permanently delete the server configuration."
            onConfirm={() => handleDeleteServer(record)}
            okText="Delete"
            cancelText="Cancel"
          >
            <Button
              type="text"
              size="small"
              icon={<Trash2 size={14} />}
              danger
            />
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <Container>
      <Header>
        <Title level={2}>MCP Servers</Title>
        <Button
          type="primary"
          icon={<Plus size={16} />}
          onClick={handleAddServer}
        >
          Add Server
        </Button>
      </Header>

      <Table
        dataSource={servers}
        columns={columns}
        rowKey="id"
        pagination={false}
        size="middle"
      />

      <Modal
        title={editingServer ? "Edit MCP Server" : "Add MCP Server"}
        open={isModalOpen}
        onOk={handleSubmit}
        onCancel={() => setIsModalOpen(false)}
        width={600}
        okText={editingServer ? "Update" : "Add"}
      >
        <Form form={form} layout="vertical" style={{ marginTop: 16 }}>
          <Form.Item
            name="name"
            label="Name"
            rules={[{ required: true, message: "Please enter server name" }]}
          >
            <Input placeholder="My MCP Server" />
          </Form.Item>

          <Form.Item name="description" label="Description">
            <Input placeholder="Optional description" />
          </Form.Item>

          <Form.Item
            name="type"
            label="Connection Type"
            rules={[
              { required: true, message: "Please select connection type" },
            ]}
            initialValue="stdio"
          >
            <Select>
              <Select.Option value="stdio">Stdio</Select.Option>
              <Select.Option value="sse">SSE</Select.Option>
              <Select.Option value="streamableHttp">
                Streamable HTTP
              </Select.Option>
            </Select>
          </Form.Item>

          <Form.Item
            noStyle
            shouldUpdate={(prevValues, currentValues) =>
              prevValues.type !== currentValues.type
            }
          >
            {({ getFieldValue }) => {
              const type = getFieldValue("type");

              if (type === "sse" || type === "streamableHttp") {
                return (
                  <>
                    <Form.Item
                      name="baseUrl"
                      label="Base URL"
                      rules={[
                        { required: true, message: "Please enter base URL" },
                      ]}
                    >
                      <Input placeholder="http://localhost:3000" />
                    </Form.Item>

                    <Form.Item name="headers" label="Headers">
                      <TextArea
                        rows={3}
                        placeholder="Content-Type=application/json&#10;Authorization=Bearer token"
                        style={{ fontFamily: "monospace" }}
                      />
                    </Form.Item>
                  </>
                );
              }

              return (
                <>
                  <Form.Item
                    name="command"
                    label="Command"
                    rules={[
                      { required: true, message: "Please enter command" },
                    ]}
                  >
                    <Input placeholder="npx @modelcontextprotocol/server-filesystem" />
                  </Form.Item>

                  <Form.Item name="args" label="Arguments">
                    <TextArea
                      rows={3}
                      placeholder="--port&#10;8080"
                      style={{ fontFamily: "monospace" }}
                    />
                  </Form.Item>

                  <Form.Item name="env" label="Environment Variables">
                    <TextArea
                      rows={3}
                      placeholder="API_KEY=your-key&#10;DEBUG=true"
                      style={{ fontFamily: "monospace" }}
                    />
                  </Form.Item>
                </>
              );
            }}
          </Form.Item>

          <Form.Item name="timeout" label="Timeout (seconds)">
            <Input type="number" placeholder="60" />
          </Form.Item>
        </Form>
      </Modal>
    </Container>
  );
};

const Container = styled.div`
  height: 100%;
`;

const Header = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 24px;
`;

export default MCPSettingsPage;
