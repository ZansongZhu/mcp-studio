/**
 * Unit tests for useConversation.
 *
 * The hook is coupled to Redux + the Electron `window.api` bridge, so we drive it
 * through a real store (the actual slice reducers) and a mocked `window.api`.
 * We never hit the network: the AI bridge is a spy, and we inspect the exact
 * `messages` array the hook assembles and the provider/model it routes to.
 */
import React from "react";
import { Provider } from "react-redux";
import { configureStore } from "@reduxjs/toolkit";
import { renderHook, act } from "@testing-library/react";
import { describe, it, expect, beforeEach, vi } from "vitest";

import mcpReducer, { setServers } from "../store/mcpSlice";
import modelReducer from "../store/modelSlice";
import assistantReducer, {
  createConversation,
  addMessage,
} from "../store/assistantSlice";
import { MCPServer } from "@shared/types";

// antd's `message` touches the DOM / matchMedia — stub it.
vi.mock("antd", () => ({
  message: { error: vi.fn(), success: vi.fn(), warning: vi.fn(), info: vi.fn() },
}));

// Import AFTER the antd mock is registered.
import { useConversation } from "./useConversation";

const DEEPSEEK_MODEL = "deepseek-v4-flash";

function makeStore() {
  return configureStore({
    reducer: {
      mcp: mcpReducer,
      model: modelReducer,
      assistant: assistantReducer,
    },
  });
}

function activeServer(): MCPServer {
  return {
    id: "srv-alpha",
    name: "Alpha Server",
    type: "stdio",
    command: "echo",
    isActive: true,
  };
}

let aiApi: {
  generateResponse: ReturnType<typeof vi.fn>;
  generateResponseWithTools: ReturnType<typeof vi.fn>;
};
let listTools: ReturnType<typeof vi.fn>;

beforeEach(() => {
  aiApi = {
    generateResponse: vi
      .fn()
      .mockResolvedValue({ success: true, response: "hi from model" }),
    generateResponseWithTools: vi
      .fn()
      .mockResolvedValue({ success: true, response: "hi from model", toolCalls: [] }),
  };
  listTools = vi.fn().mockResolvedValue([
    {
      name: "get_stock_price",
      description: "Get the current stock price",
      serverId: "srv-alpha",
      serverName: "Alpha Server",
      inputSchema: { type: "object", properties: { ticker: { type: "string" } } },
    },
  ]);

  (globalThis as any).window.api = {
    ai: aiApi,
    mcp: { listTools },
  };
});

/** Render the hook against a given store. */
function renderConversation(store: ReturnType<typeof makeStore>) {
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <Provider store={store}>{children}</Provider>
  );
  return renderHook(() => useConversation(), { wrapper });
}

describe("useConversation.handleSendMessage", () => {
  it("uses the plain assistant prompt and routes to the model's provider when no servers are active", async () => {
    const store = makeStore();
    store.dispatch(
      createConversation({ title: "chat", modelId: DEEPSEEK_MODEL, mcpServerIds: [] })
    );

    const { result } = renderConversation(store);
    await act(async () => {
      await result.current.handleSendMessage("who are you");
    });

    // No active servers -> the tool-free path.
    expect(aiApi.generateResponse).toHaveBeenCalledTimes(1);
    expect(aiApi.generateResponseWithTools).not.toHaveBeenCalled();

    const call = aiApi.generateResponse.mock.calls[0][0];

    // Routing: a deepseek model must go to the deepseek provider, unchanged id.
    expect(call.providerId).toBe("deepseek");
    expect(call.model).toBe(DEEPSEEK_MODEL);

    // First message is the system prompt; last is the freshly typed user message.
    const system = call.messages[0];
    expect(system.role).toBe("system");
    expect(system.content).toContain("DeepSeek V4 Flash"); // pinned identity
    expect(system.content).toContain("financial data"); // the default prompt
    expect(system.content).not.toContain("<tool_call>"); // not the tool prompt

    const last = call.messages[call.messages.length - 1];
    expect(last).toMatchObject({ role: "user", content: "who are you" });
  });

  it("switches to the tool-aware prompt (with the real serverId) when an active server exposes tools", async () => {
    const store = makeStore();
    store.dispatch(setServers([activeServer()]));
    store.dispatch(
      createConversation({
        title: "chat",
        modelId: DEEPSEEK_MODEL,
        mcpServerIds: ["srv-alpha"],
      })
    );

    const { result } = renderConversation(store);
    await act(async () => {
      await result.current.handleSendMessage("price of AAPL?");
    });

    expect(listTools).toHaveBeenCalledTimes(1);
    expect(aiApi.generateResponseWithTools).toHaveBeenCalledTimes(1);
    expect(aiApi.generateResponse).not.toHaveBeenCalled();

    const call = aiApi.generateResponseWithTools.mock.calls[0][0];
    expect(call.providerId).toBe("deepseek");
    expect(call.serverIds).toEqual(["srv-alpha"]);

    const system = call.messages[0];
    expect(system.content).toContain("<tool_call>");
    expect(system.content).toContain("get_stock_price"); // tool listed
    expect(system.content).toContain('"srv-alpha"'); // exact server id injected
  });

  it("falls back to the plain prompt when an active server exposes no tools", async () => {
    const store = makeStore();
    store.dispatch(setServers([activeServer()]));
    store.dispatch(
      createConversation({
        title: "chat",
        modelId: DEEPSEEK_MODEL,
        mcpServerIds: ["srv-alpha"],
      })
    );
    listTools.mockResolvedValueOnce([]); // server up, but zero tools

    const { result } = renderConversation(store);
    await act(async () => {
      await result.current.handleSendMessage("hello");
    });

    const call = aiApi.generateResponseWithTools.mock.calls[0][0];
    // With no tools, the code keeps the default (non-tool) system prompt.
    expect(call.messages[0].content).toContain("financial data");
    expect(call.messages[0].content).not.toContain("<tool_call>");
  });

  it("caps conversation history at maxHistoryMessages (50) before sending", async () => {
    const store = makeStore();
    store.dispatch(
      createConversation({ title: "chat", modelId: DEEPSEEK_MODEL, mcpServerIds: [] })
    );
    const conversationId = store.getState().assistant.activeConversationId!;

    // Seed 60 prior messages (short, so the char budget is never the limiter).
    for (let i = 0; i < 60; i++) {
      store.dispatch(
        addMessage({
          conversationId,
          message: { role: "user", content: `msg ${i}`, modelId: DEEPSEEK_MODEL },
        })
      );
    }

    const { result } = renderConversation(store);
    await act(async () => {
      await result.current.handleSendMessage("newest question");
    });

    const call = aiApi.generateResponse.mock.calls[0][0];
    // messages = [system, ...prunedHistory(<=50), userMessage]
    const prunedHistory = call.messages.slice(1, -1);
    expect(prunedHistory.length).toBe(50);
  });

  it("treats /tools as a local command and never calls the AI bridge", async () => {
    const store = makeStore();
    store.dispatch(
      createConversation({ title: "chat", modelId: DEEPSEEK_MODEL, mcpServerIds: [] })
    );

    const { result } = renderConversation(store);
    let ret: any;
    await act(async () => {
      ret = await result.current.handleSendMessage("/tools");
    });

    expect(ret).toEqual({ isToolsCommand: true });
    expect(aiApi.generateResponse).not.toHaveBeenCalled();
    expect(aiApi.generateResponseWithTools).not.toHaveBeenCalled();
  });

  // ---------------------------------------------------------------------------
  // Regression guard for the "I'm created by Anthropic" / "I'm V3" drift.
  //
  // Root cause: the system prompt never stated which model was answering, so the
  // model filled the identity gap from its (stale) training data - sometimes
  // claiming to be Claude/Anthropic, or reporting V3 when served by V4. The fix
  // pins the real model name + provider into the prompt. These assertions verify
  // the identity is injected in BOTH the plain and tool-aware prompts.
  // ---------------------------------------------------------------------------
  it("pins the model name + provider into the plain system prompt", async () => {
    const store = makeStore();
    store.dispatch(
      createConversation({ title: "chat", modelId: DEEPSEEK_MODEL, mcpServerIds: [] })
    );

    const { result } = renderConversation(store);
    await act(async () => {
      await result.current.handleSendMessage("who made you");
    });

    const system = aiApi.generateResponse.mock.calls[0][0].messages[0].content;
    // "DeepSeek V4 Flash" is the display name of deepseek-v4-flash in defaultModels.
    expect(system).toContain("DeepSeek V4 Flash");
    expect(system).toContain("DeepSeek"); // provider name
    // still carries the original assistant instructions
    expect(system).toContain("financial data");
  });

  it("pins the model identity into the tool-aware system prompt too", async () => {
    const store = makeStore();
    store.dispatch(setServers([activeServer()]));
    store.dispatch(
      createConversation({
        title: "chat",
        modelId: DEEPSEEK_MODEL,
        mcpServerIds: ["srv-alpha"],
      })
    );

    const { result } = renderConversation(store);
    await act(async () => {
      await result.current.handleSendMessage("price of AAPL?");
    });

    const system =
      aiApi.generateResponseWithTools.mock.calls[0][0].messages[0].content;
    expect(system).toContain("DeepSeek V4 Flash"); // identity present
    expect(system).toContain("<tool_call>"); // and still tool-aware
  });
});
