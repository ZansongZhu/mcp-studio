import React from "react";
import { Select, Typography } from "antd";
import styled from "styled-components";

const { Title } = Typography;

interface ConversationHeaderProps {
  conversation: any;
  availableModels: any[];
  servers: any[];
  onModelChange: (modelId: string) => void;
  onServersChange: (serverIds: string[]) => void;
}

const ConversationHeader: React.FC<ConversationHeaderProps> = ({
  conversation,
  availableModels,
  servers,
  onModelChange,
  onServersChange,
}) => {
  return (
    <ChatHeader>
      <Title level={4} style={{ margin: 0 }}>
        {conversation.title}
      </Title>
      <HeaderControls>
        <ControlGroup>
          <ControlLabel>Model:</ControlLabel>
          <Select
            value={conversation.modelId}
            onChange={onModelChange}
            style={{ width: 160 }}
            placeholder="Select model"
          >
            {availableModels.map((model) => {
              return (
                <Select.Option key={model.id} value={model.id}>
                  {model.name}
                </Select.Option>
              );
            })}
          </Select>
        </ControlGroup>
        <ControlGroup>
          <ControlLabel>Tools:</ControlLabel>
          <Select
            mode="multiple"
            value={conversation.mcpServerIds}
            onChange={onServersChange}
            style={{ width: 250 }}
            placeholder="MCP Servers"
            optionLabelProp="label"
          >
            {servers.map((server) => (
              <Select.Option
                key={server.id}
                value={server.id}
                label={server.name}
              >
                {server.name}
              </Select.Option>
            ))}
          </Select>
        </ControlGroup>
      </HeaderControls>
    </ChatHeader>
  );
};

const ChatHeader = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px 24px;
  border-bottom: 1px solid #f0f0f0;
`;

const HeaderControls = styled.div`
  display: flex;
  gap: 12px;
  align-items: center;
`;

const ControlGroup = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
`;

const ControlLabel = styled.span`
  font-size: 14px;
  font-weight: 500;
  color: #666;
  min-width: fit-content;
`;

export default ConversationHeader;