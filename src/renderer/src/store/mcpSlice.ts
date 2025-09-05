import { createSlice, PayloadAction } from "@reduxjs/toolkit";
import { MCPServer } from "@shared/types";
import { v4 as uuidv4 } from "uuid";

interface MCPState {
  servers: MCPServer[];
  activeServerId?: string;
}

const initialState: MCPState = {
  servers: [],
};

const mcpSlice = createSlice({
  name: "mcp",
  initialState,
  reducers: {
    addServer: (state, action: PayloadAction<Omit<MCPServer, "id">>) => {
      const server: MCPServer = {
        id: uuidv4(),
        ...action.payload,
      };
      state.servers.push(server);
    },

    updateServer: (state, action: PayloadAction<MCPServer>) => {
      const index = state.servers.findIndex((s) => s.id === action.payload.id);
      if (index !== -1) {
        state.servers[index] = action.payload;
      }
    },

    removeServer: (state, action: PayloadAction<string>) => {
      state.servers = state.servers.filter((s) => s.id !== action.payload);
      if (state.activeServerId === action.payload) {
        state.activeServerId = undefined;
      }
    },

    setActiveServer: (state, action: PayloadAction<string | undefined>) => {
      state.activeServerId = action.payload;
    },

    setServers: (state, action: PayloadAction<MCPServer[]>) => {
      state.servers = action.payload;
    },
  },
});

export const {
  addServer,
  updateServer,
  removeServer,
  setActiveServer,
  setServers,
} = mcpSlice.actions;
export default mcpSlice.reducer;
