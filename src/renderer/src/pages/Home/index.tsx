import React, { useEffect } from "react";
import { Button, Typography, Space, Card } from "antd";
import { Plus, Info } from "lucide-react";
import styled from "styled-components";

import { useConversation } from "../../hooks/useConversation";
import { useMCPTools } from "../../hooks/useMCPTools";
import { useStorage } from "../../hooks/useStorage";

import ConversationList from "./ConversationList";
import MessageList from "./MessageList";
import ConversationHeader from "../../components/ChatInterface/ConversationHeader";
import MessageInput from "../../components/ChatInterface/MessageInput";
import ToolsModal from "../../components/ChatInterface/ToolsModal";
import TypingIndicator from "../../components/ChatInterface/TypingIndicator";

const { Title } = Typography;

const HomePage: React.FC = () => {
  console.log("HomePage component rendering");
  const { saveActiveModelId } = useStorage();
  
  const {
    activeConversation,
    availableModels,
    servers,
    activeServers,
    handleNewConversation,
    handleSendMessage,
    updateConversationModel,
    updateConversationServers,
  } = useConversation();

  const {
    showToolsModal,
    serverToolsList,
    loadingTools,
    fetchAllServerTools,
    openToolsModal,
    closeToolsModal,
  } = useMCPTools();

  // Save active model ID to storage when it changes
  useEffect(() => {
    if (activeConversation?.modelId) {
      saveActiveModelId(activeConversation.modelId).catch((error) => {
        console.error("Failed to save active model:", error);
      });
    }
  }, [activeConversation?.modelId, saveActiveModelId]);

  const handleSendMessageWithTools = async (message: string) => {
    const result = await handleSendMessage(message);
    
    // Handle /tools command
    if (result?.isToolsCommand) {
      openToolsModal();
      if (activeConversation) {
        await fetchAllServerTools(servers, activeConversation);
      }
    }
    
    return result;
  };

  const handleViewAvailableTools = () => {

    // This would need to be implemented differently since we can't directly dispatch from here
    // For now, just open the tools modal
    openToolsModal();
    
    // Use a dummy conversation for fetching tools
    const dummyConversation = {
      id: "temp",
      mcpServerIds: activeServers.map((s) => s.id),
    };
    
    fetchAllServerTools(servers, dummyConversation);
  };

  return (
    <Container>
      <Sidebar>
        <SidebarHeader>
          <Button
            type="primary"
            icon={<Plus size={16} />}
            onClick={handleNewConversation}
            block
          >
            New Chat
          </Button>
        </SidebarHeader>
        <ConversationList />
      </Sidebar>

      <MainContent>
        {activeConversation ? (
          <>
            <ConversationHeader
              conversation={activeConversation}
              availableModels={availableModels}
              servers={servers}
              onModelChange={(modelId) =>
                updateConversationModel(activeConversation.id, modelId)
              }
              onServersChange={(serverIds) =>
                updateConversationServers(activeConversation.id, serverIds)
              }
            />

            <MessagesContainer>
              <MessageList conversation={activeConversation} />
              <TypingIndicator visible={!!activeConversation.isGenerating} />
            </MessagesContainer>

            <MessageInput
              onSendMessage={handleSendMessageWithTools}
              disabled={activeConversation.isGenerating}
              loading={activeConversation.isGenerating}
            />
          </>
        ) : (
          <WelcomeCard>
            <Title level={2}>Welcome to MCP Studio</Title>
            <p>
              Start a new conversation to begin chatting with AI models and
              using MCP tools.
            </p>
            <Space direction="vertical" size="middle">
              <div>
                <strong>Active MCP Servers:</strong> {activeServers.length}
              </div>
              <div>
                <strong>Available Models:</strong> {availableModels.length}
              </div>
              <div>
                <Button
                  type="default"
                  icon={<Info size={16} />}
                  onClick={handleViewAvailableTools}
                >
                  View Available Tools
                </Button>
              </div>
            </Space>
          </WelcomeCard>
        )}
      </MainContent>

      <ToolsModal
        visible={showToolsModal}
        onClose={closeToolsModal}
        serverToolsList={serverToolsList}
        servers={servers}
        loading={loadingTools}
      />
    </Container>
  );
};

const Container = styled.div`
  display: flex;
  flex: 1;
  gap: 4px;
  padding: 4px;
  height: 100vh;
  overflow: hidden;
`;

const Sidebar = styled.div`
  width: 280px;
  display: flex;
  flex-direction: column;
  background: white;
  border-radius: 8px;
  border: 1px solid #f0f0f0;
  height: 100%;
`;

const SidebarHeader = styled.div`
  padding: 16px;
  border-bottom: 1px solid #f0f0f0;
`;

const MainContent = styled.div`
  flex: 1;
  display: flex;
  flex-direction: column;
  background: white;
  border-radius: 8px;
  border: 1px solid #f0f0f0;
  height: 100%;
  min-height: 0;
`;

const MessagesContainer = styled.div`
  flex: 1;
  overflow-y: auto;
  padding: 16px 24px;
  min-height: 0;
`;

const WelcomeCard = styled(Card)`
  margin: 40px auto;
  max-width: 500px;
  text-align: center;

  .ant-card-body {
    padding: 40px;
  }
`;

export default HomePage;