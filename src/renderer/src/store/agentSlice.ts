import { createSlice, PayloadAction } from "@reduxjs/toolkit";
import { Agent } from "@shared/types";
import { v4 as uuidv4 } from "uuid";

interface AgentState {
  agents: Agent[];
  activeAgentId?: string;
}

const initialState: AgentState = {
  agents: [],
  activeAgentId: undefined,
};

const agentSlice = createSlice({
  name: "agent",
  initialState,
  reducers: {
    addAgent: (state, action: PayloadAction<Omit<Agent, "id" | "createdAt" | "updatedAt">>) => {
      const agent: Agent = {
        id: uuidv4(),
        createdAt: Date.now(),
        updatedAt: Date.now(),
        ...action.payload,
      };
      state.agents.push(agent);
    },

    updateAgent: (state, action: PayloadAction<Agent>) => {
      const index = state.agents.findIndex((a) => a.id === action.payload.id);
      if (index !== -1) {
        state.agents[index] = {
          ...action.payload,
          updatedAt: Date.now(),
        };
      }
    },

    removeAgent: (state, action: PayloadAction<string>) => {
      state.agents = state.agents.filter((a) => a.id !== action.payload);
      if (state.activeAgentId === action.payload) {
        state.activeAgentId = undefined;
      }
    },

    setActiveAgent: (state, action: PayloadAction<string | undefined>) => {
      state.activeAgentId = action.payload;
    },

    setAgents: (state, action: PayloadAction<Agent[]>) => {
      state.agents = action.payload;
    },
  },
});

export const {
  addAgent,
  updateAgent,
  removeAgent,
  setActiveAgent,
  setAgents,
} = agentSlice.actions;

export default agentSlice.reducer;