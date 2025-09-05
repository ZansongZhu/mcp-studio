import { configureStore } from "@reduxjs/toolkit";
import mcpReducer from "./mcpSlice";
import modelReducer from "./modelSlice";
import assistantReducer from "./assistantSlice";

export const store = configureStore({
  reducer: {
    mcp: mcpReducer,
    model: modelReducer,
    assistant: assistantReducer,
  },
  devTools: false,
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;
