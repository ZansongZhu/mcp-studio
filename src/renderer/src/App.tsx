import React from "react";
import { Provider } from "react-redux";
import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import { ConfigProvider, theme } from "antd";
import { store } from "./store";
import Layout from "./components/Layout";
import AppInitializer from "./components/AppInitializer";
import HomePage from "./pages/Home";
import PromptTemplatesPage from "./pages/PromptTemplates";
import MCPSettingsPage from "./pages/MCPSettings";
import ModelSettingsPage from "./pages/ModelSettings";
import "./App.css";

const App: React.FC = () => {
  return (
    <Provider store={store}>
      <ConfigProvider
        theme={{
          algorithm: theme.defaultAlgorithm,
          token: {
            colorPrimary: "#1890ff",
            borderRadius: 6,
          },
        }}
      >
        <AppInitializer />
        <Router>
          <Layout>
            <Routes>
              <Route path="/" element={<HomePage />} />
              <Route path="/prompts" element={<PromptTemplatesPage />} />
              <Route path="/mcp" element={<MCPSettingsPage />} />
              <Route path="/models" element={<ModelSettingsPage />} />
            </Routes>
          </Layout>
        </Router>
      </ConfigProvider>
    </Provider>
  );
};

export default App;
