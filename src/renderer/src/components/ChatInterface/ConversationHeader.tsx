import React from "react";
import { Typography } from "antd";
import { useSelector } from "react-redux";
import { Bot, User } from "lucide-react";
import styled from "styled-components";
import { RootState } from "../../store";

const { Title } = Typography;

interface ConversationHeaderProps {
  conversation: any;
}

const ConversationHeader: React.FC<ConversationHeaderProps> = ({
  conversation,
}) => {
  const agents = useSelector((state: RootState) => state.agent.agents);
  
  // Determine the active agent for this conversation
  // Priority: lastMentionedAgent > conversationDefaultAgent
  const activeAgent = conversation.lastMentionedAgentId 
    ? agents.find(agent => agent.id === conversation.lastMentionedAgentId)
    : conversation.agentId 
      ? agents.find(agent => agent.id === conversation.agentId)
      : null;
      
  const isGenerating = conversation.isGenerating;

  return (
    <ChatHeader>
      <Title level={4} style={{ margin: 0 }}>
        {conversation.title}
      </Title>
      <HeaderInfo>
        {activeAgent ? (
          <AgentStatus>
            <AgentIcon>
              <Bot size={14} />
            </AgentIcon>
            <AgentName>@{activeAgent.name}</AgentName>
            {isGenerating && <StatusText>responding...</StatusText>}
          </AgentStatus>
        ) : (
          <StatusInfo>
            <User size={14} />
            <InfoText>Type @ to mention an agent</InfoText>
          </StatusInfo>
        )}
      </HeaderInfo>
    </ChatHeader>
  );
};

const ChatHeader = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px 24px;
  background: white;
  border-bottom: 1px solid #f0f0f0;
`;

const HeaderInfo = styled.div`
  display: flex;
  align-items: center;
`;

const StatusInfo = styled.div`
  display: flex;
  align-items: center;
  gap: 6px;
`;

const AgentStatus = styled.div`
  display: flex;
  align-items: center;
  gap: 6px;
  background: #f6ffed;
  border: 1px solid #b7eb8f;
  border-radius: 12px;
  padding: 4px 8px;
`;

const AgentIcon = styled.div`
  color: #52c41a;
  display: flex;
  align-items: center;
`;

const AgentName = styled.span`
  font-size: 12px;
  color: #52c41a;
  font-weight: 500;
`;

const StatusText = styled.span`
  font-size: 11px;
  color: #666;
  font-style: italic;
  margin-left: 4px;
`;

const InfoText = styled.span`
  font-size: 12px;
  color: #999;
  font-style: italic;
  margin-left: 4px;
`;

export default ConversationHeader;