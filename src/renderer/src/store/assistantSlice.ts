import { createSlice, createEntityAdapter, PayloadAction, createSelector } from "@reduxjs/toolkit";
import { v4 as uuidv4 } from "uuid";
import { RootState } from "./index";

export interface Message {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  timestamp: number;
  modelId?: string;
  conversationId: string; // Normalized reference
  toolCallIds: string[]; // Array of tool call IDs
}

export interface ToolCall {
  id: string;
  name: string;
  args: any;
  result?: any;
  error?: string;
  serverId: string;
  serverName: string;
  messageId: string; // Normalized reference
}

export interface Conversation {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  modelId: string;
  mcpServerIds: string[];
  isGenerating?: boolean;
  messageIds: string[]; // Array of message IDs instead of nested messages
}

// Entity adapters
const conversationAdapter = createEntityAdapter<Conversation>({
  sortComparer: (a, b) => b.updatedAt - a.updatedAt, // Sort by most recent
});

const messageAdapter = createEntityAdapter<Message>({
  sortComparer: (a, b) => a.timestamp - b.timestamp, // Sort by chronological order
});

const toolCallAdapter = createEntityAdapter<ToolCall>();

interface AssistantState {
  conversations: ReturnType<typeof conversationAdapter.getInitialState>;
  messages: ReturnType<typeof messageAdapter.getInitialState>;
  toolCalls: ReturnType<typeof toolCallAdapter.getInitialState>;
  activeConversationId?: string;
  ui: {
    isLoading: boolean;
    error?: string;
    lastAction?: string;
  };
}

const initialState: AssistantState = {
  conversations: conversationAdapter.getInitialState(),
  messages: messageAdapter.getInitialState(),
  toolCalls: toolCallAdapter.getInitialState(),
  ui: {
    isLoading: false,
  },
};

const assistantSlice = createSlice({
  name: "assistant",
  initialState,
  reducers: {
    // Conversation actions
    createConversation: (
      state,
      action: PayloadAction<{
        title: string;
        modelId: string;
        mcpServerIds?: string[];
      }>
    ) => {
      const conversation: Conversation = {
        id: uuidv4(),
        title: action.payload.title,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        modelId: action.payload.modelId,
        mcpServerIds: action.payload.mcpServerIds || [],
        isGenerating: false,
        messageIds: [],
      };
      
      conversationAdapter.addOne(state.conversations, conversation);
      state.activeConversationId = conversation.id;
      state.ui.lastAction = 'createConversation';
    },

    updateConversation: (
      state,
      action: PayloadAction<{ id: string; changes: Partial<Conversation> }>
    ) => {
      const { id, changes } = action.payload;
      conversationAdapter.updateOne(state.conversations, {
        id,
        changes: { ...changes, updatedAt: Date.now() },
      });
      state.ui.lastAction = 'updateConversation';
    },

    deleteConversation: (state, action: PayloadAction<string>) => {
      const conversationId = action.payload;
      const conversation = state.conversations.entities[conversationId];
      
      if (conversation) {
        // Delete all messages and tool calls for this conversation
        const messageIds = conversation.messageIds;
        messageAdapter.removeMany(state.messages, messageIds);
        
        // Find and delete all tool calls for these messages
        const toolCallIds = messageIds.flatMap(messageId => 
          Object.values(state.toolCalls.entities)
            .filter(toolCall => toolCall?.messageId === messageId)
            .map(toolCall => toolCall!.id)
        );
        toolCallAdapter.removeMany(state.toolCalls, toolCallIds);
        
        // Delete the conversation
        conversationAdapter.removeOne(state.conversations, conversationId);
        
        if (state.activeConversationId === conversationId) {
          state.activeConversationId = undefined;
        }
      }
      state.ui.lastAction = 'deleteConversation';
    },

    setActiveConversation: (
      state,
      action: PayloadAction<string | undefined>
    ) => {
      state.activeConversationId = action.payload;
      state.ui.lastAction = 'setActiveConversation';
    },

    setConversationGenerating: (
      state,
      action: PayloadAction<{ conversationId: string; isGenerating: boolean }>
    ) => {
      const { conversationId, isGenerating } = action.payload;
      conversationAdapter.updateOne(state.conversations, {
        id: conversationId,
        changes: { isGenerating, updatedAt: Date.now() },
      });
      state.ui.lastAction = 'setConversationGenerating';
    },

    // Message actions
    addMessage: (
      state,
      action: PayloadAction<{
        conversationId: string;
        message: Omit<Message, "id" | "timestamp" | "conversationId" | "toolCallIds">;
      }>
    ) => {
      const { conversationId, message: messageData } = action.payload;
      
      const message: Message = {
        id: uuidv4(),
        timestamp: Date.now(),
        conversationId,
        toolCallIds: [],
        ...messageData,
      };

      messageAdapter.addOne(state.messages, message);
      
      // Update conversation's message list and timestamp
      const conversation = state.conversations.entities[conversationId];
      if (conversation) {
        conversationAdapter.updateOne(state.conversations, {
          id: conversationId,
          changes: {
            messageIds: [...conversation.messageIds, message.id],
            updatedAt: Date.now(),
          },
        });
      }
      
      state.ui.lastAction = 'addMessage';
    },

    updateMessage: (
      state,
      action: PayloadAction<{
        messageId: string;
        updates: Partial<Message>;
      }>
    ) => {
      const { messageId, updates } = action.payload;
      messageAdapter.updateOne(state.messages, {
        id: messageId,
        changes: updates,
      });
      
      // Update conversation timestamp
      const message = state.messages.entities[messageId];
      if (message) {
        conversationAdapter.updateOne(state.conversations, {
          id: message.conversationId,
          changes: { updatedAt: Date.now() },
        });
      }
      
      state.ui.lastAction = 'updateMessage';
    },

    // Tool call actions
    addToolCall: (
      state,
      action: PayloadAction<{
        messageId: string;
        toolCall: Omit<ToolCall, "id" | "messageId">;
      }>
    ) => {
      const { messageId, toolCall: toolCallData } = action.payload;
      
      const toolCall: ToolCall = {
        id: uuidv4(),
        messageId,
        ...toolCallData,
      };

      toolCallAdapter.addOne(state.toolCalls, toolCall);
      
      // Update message's tool call list
      const message = state.messages.entities[messageId];
      if (message) {
        messageAdapter.updateOne(state.messages, {
          id: messageId,
          changes: {
            toolCallIds: [...message.toolCallIds, toolCall.id],
          },
        });
        
        // Update conversation timestamp
        conversationAdapter.updateOne(state.conversations, {
          id: message.conversationId,
          changes: { updatedAt: Date.now() },
        });
      }
      
      state.ui.lastAction = 'addToolCall';
    },

    updateToolCall: (
      state,
      action: PayloadAction<{
        toolCallId: string;
        updates: Partial<ToolCall>;
      }>
    ) => {
      const { toolCallId, updates } = action.payload;
      toolCallAdapter.updateOne(state.toolCalls, {
        id: toolCallId,
        changes: updates,
      });
      state.ui.lastAction = 'updateToolCall';
    },

    // Bulk actions for loading from storage
    setConversations: (state, action: PayloadAction<Conversation[]>) => {
      conversationAdapter.setAll(state.conversations, action.payload);
      state.ui.lastAction = 'setConversations';
    },

    setMessages: (state, action: PayloadAction<Message[]>) => {
      messageAdapter.setAll(state.messages, action.payload);
      state.ui.lastAction = 'setMessages';
    },

    setToolCalls: (state, action: PayloadAction<ToolCall[]>) => {
      toolCallAdapter.setAll(state.toolCalls, action.payload);
      state.ui.lastAction = 'setToolCalls';
    },

    // Utility actions
    pruneConversationMessages: (
      state,
      action: PayloadAction<{ conversationId: string; maxMessages: number }>
    ) => {
      const { conversationId, maxMessages } = action.payload;
      const conversation = state.conversations.entities[conversationId];
      
      if (conversation && conversation.messageIds.length > maxMessages) {
        const messagesToKeep = conversation.messageIds.slice(-maxMessages);
        const messagesToRemove = conversation.messageIds.slice(0, -maxMessages);
        
        // Remove old messages
        messageAdapter.removeMany(state.messages, messagesToRemove);
        
        // Remove tool calls for removed messages
        const toolCallsToRemove = messagesToRemove.flatMap(messageId =>
          Object.values(state.toolCalls.entities)
            .filter(toolCall => toolCall?.messageId === messageId)
            .map(toolCall => toolCall!.id)
        );
        toolCallAdapter.removeMany(state.toolCalls, toolCallsToRemove);
        
        // Update conversation
        conversationAdapter.updateOne(state.conversations, {
          id: conversationId,
          changes: {
            messageIds: messagesToKeep,
            updatedAt: Date.now(),
          },
        });
      }
      
      state.ui.lastAction = 'pruneConversationMessages';
    },

    // UI actions
    setLoading: (state, action: PayloadAction<boolean>) => {
      state.ui.isLoading = action.payload;
    },

    setError: (state, action: PayloadAction<string | undefined>) => {
      state.ui.error = action.payload;
    },

    // Legacy compatibility actions (for existing components)
    updateConversationTitle: (
      state,
      action: PayloadAction<{ id: string; title: string }>
    ) => {
      conversationAdapter.updateOne(state.conversations, {
        id: action.payload.id,
        changes: { title: action.payload.title, updatedAt: Date.now() },
      });
    },

    updateConversationMcpServers: (
      state,
      action: PayloadAction<{ id: string; mcpServerIds: string[] }>
    ) => {
      conversationAdapter.updateOne(state.conversations, {
        id: action.payload.id,
        changes: { mcpServerIds: action.payload.mcpServerIds, updatedAt: Date.now() },
      });
    },

    updateConversationModel: (
      state,
      action: PayloadAction<{ id: string; modelId: string }>
    ) => {
      conversationAdapter.updateOne(state.conversations, {
        id: action.payload.id,
        changes: { modelId: action.payload.modelId, updatedAt: Date.now() },
      });
    },
  },
});

// Selectors
const selectConversationState = (state: RootState) => state.assistant.conversations;
const selectMessageState = (state: RootState) => state.assistant.messages;
const selectToolCallState = (state: RootState) => state.assistant.toolCalls;

// Basic entity selectors
export const {
  selectAll: selectAllConversations,
  selectById: selectConversationById,
  selectIds: selectConversationIds,
} = conversationAdapter.getSelectors(selectConversationState);

export const {
  selectAll: selectAllMessages,
  selectById: selectMessageById,
  selectIds: selectMessageIds,
} = messageAdapter.getSelectors(selectMessageState);

export const {
  selectAll: selectAllToolCalls,
  selectById: selectToolCallById,
  selectIds: selectToolCallIds,
} = toolCallAdapter.getSelectors(selectToolCallState);

// Composed selectors
export const selectActiveConversationId = (state: RootState) => 
  state.assistant.activeConversationId;

export const selectActiveConversation = createSelector(
  [selectConversationState, selectActiveConversationId],
  (conversations, activeId) => 
    activeId ? conversations.entities[activeId] : undefined
);

export const selectConversationWithMessages = createSelector(
  [
    selectConversationById,
    selectAllMessages,
    (_: RootState, conversationId: string) => conversationId,
  ],
  (conversation, allMessages, conversationId) => {
    if (!conversation) return undefined;
    
    const messages = allMessages.filter(message => message.conversationId === conversationId);
    return {
      ...conversation,
      messages,
    };
  }
);

export const selectMessageWithToolCalls = createSelector(
  [
    selectMessageById,
    selectAllToolCalls,
    (_: RootState, messageId: string) => messageId,
  ],
  (message, allToolCalls, messageId) => {
    if (!message) return undefined;
    
    const toolCalls = allToolCalls.filter(toolCall => toolCall.messageId === messageId);
    return {
      ...message,
      toolCalls,
    };
  }
);

export const selectConversationMessages = createSelector(
  [selectAllMessages, (_: RootState, conversationId: string) => conversationId],
  (messages, conversationId) =>
    messages
      .filter(message => message.conversationId === conversationId)
      .sort((a, b) => a.timestamp - b.timestamp)
);

export const selectUIState = (state: RootState) => state.assistant.ui;

// Export actions
export const {
  createConversation,
  updateConversation,
  deleteConversation,
  setActiveConversation,
  setConversationGenerating,
  addMessage,
  updateMessage,
  addToolCall,
  updateToolCall,
  setConversations,
  setMessages,
  setToolCalls,
  pruneConversationMessages,
  setLoading,
  setError,
  // Legacy compatibility
  updateConversationTitle,
  updateConversationMcpServers,
  updateConversationModel,
} = assistantSlice.actions;

export default assistantSlice.reducer;