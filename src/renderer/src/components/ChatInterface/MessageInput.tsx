import React, { useRef, useEffect } from "react";
import { Button, Input, Space } from "antd";
import { Send, Bot } from "lucide-react";
import styled from "styled-components";
import { usePromptTemplates } from "../../hooks/usePromptTemplates";
import { useAgentMentions } from "../../hooks/useAgentMentions";

const { TextArea } = Input;

interface MessageInputProps {
  onSendMessage: (message: string, mentionedAgent?: any, mentionedAgents?: any[]) => Promise<any>;
  disabled?: boolean;
  loading?: boolean;
}

const MessageInput: React.FC<MessageInputProps> = ({
  onSendMessage,
  disabled = false,
  loading = false,
}) => {
  const textAreaRef = useRef<any>(null);

  const {
    filteredTemplates,
    selectedPromptChips,
    showPromptDropdown,
    selectedIndex: promptSelectedIndex,
    handleInputChange: handlePromptInputChange,
    handleSelectTemplate,
    handleRemoveChip,
    buildMessageContent,
    clearChips,
    handleKeyDown: handlePromptKeyDown,
  } = usePromptTemplates();

  const {
    inputValue,
    setInputValue,
    filteredAgents,
    showAgentDropdown,
    selectedIndex: agentSelectedIndex,
    handleInputChange: handleAgentInputChange,
    handleSelectAgent,
    getMentionedAgent,
    getMentionedAgents,
    handleKeyDown: handleAgentKeyDown,
    clearState: clearAgentState
  } = useAgentMentions();

  // Auto-focus input when loading changes from true to false (assistant finishes responding)
  const prevLoadingRef = useRef(loading);
  useEffect(() => {
    if (prevLoadingRef.current === true && loading === false) {
      // Assistant just finished responding, focus the input
      setTimeout(() => {
        if (textAreaRef.current) {
          textAreaRef.current.focus();
        }
      }, 100); // Small delay to ensure UI has updated
    }
    prevLoadingRef.current = loading;
  }, [loading]);

  const handleInputChangeInternal = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const value = e.target.value;
    const cursor = e.target.selectionStart;
    
    // Handle both prompt and agent input changes
    handlePromptInputChange(value, cursor);
    handleAgentInputChange(value, cursor);
  };

  const handleSendInternal = async () => {
    const messageContent = buildMessageContent(inputValue);
    if (!messageContent.trim()) return;

    console.log("📝 [MESSAGE_INPUT] Message content:", messageContent);
    console.log("📝 [MESSAGE_INPUT] Input value:", inputValue);

    // Check if there are mentioned agents (single or multiple)
    console.log("📝 [MESSAGE_INPUT] Message content to parse:", messageContent);
    const mentionedAgent = getMentionedAgent(messageContent); // For backward compatibility
    const mentionedAgents = getMentionedAgents(messageContent); // For multi-agent support
    console.log("📝 [MESSAGE_INPUT] Mentioned agent:", mentionedAgent);
    console.log("📝 [MESSAGE_INPUT] All mentioned agents:", mentionedAgents);
    console.log("📝 [MESSAGE_INPUT] Type check - mentionedAgents is:", typeof mentionedAgents, Array.isArray(mentionedAgents));
    
    const result = await onSendMessage(messageContent, mentionedAgent, mentionedAgents);
    console.log("📝 [MESSAGE_INPUT] Send result:", result);
    
    // Only clear input and chips if message was sent successfully
    if (result && !result.isToolsCommand) {
      clearChips();
      clearAgentState();
    }
  };

  const handleKeyDownInternal = (e: React.KeyboardEvent) => {
    // First check agent mentions (higher priority)
    const agentResult = handleAgentKeyDown(e, handleSendInternal);
    if (agentResult.preventDefault) {
      if (agentResult.selectAgentAtIndex !== undefined && filteredAgents.length > 0) {
        const agent = filteredAgents[agentResult.selectAgentAtIndex];
        if (agent) {
          handleSelectAgent(agent, textAreaRef);
        }
      }
      return;
    }

    // Then check prompt templates
    const promptResult = handlePromptKeyDown(e, handleSendInternal);
    if (promptResult?.selectTemplateAtIndex !== undefined && filteredTemplates.length > 0) {
      const template = filteredTemplates[promptResult.selectTemplateAtIndex];
      if (template) {
        const newValue = handleSelectTemplate(template, inputValue, textAreaRef);
        setInputValue(newValue);
      }
    }
  };

  const handleTemplateSelect = (template: any) => {
    const newValue = handleSelectTemplate(template, inputValue, textAreaRef);
    setInputValue(newValue);
  };

  const handleAgentSelect = (agent: any) => {
    handleSelectAgent(agent, textAreaRef);
  };

  return (
    <InputContainer>
      <Space.Compact style={{ width: "100%" }}>
        <TextArea
          ref={textAreaRef}
          value={inputValue}
          onChange={handleInputChangeInternal}
          onKeyDown={handleKeyDownInternal}
          placeholder="Type your message... (use @ to mention agents, /[short key] for templates)"
          autoSize={{ minRows: 1, maxRows: 4 }}
          style={{ resize: "none" }}
          disabled={disabled}
        />
        <Button
          type="primary"
          icon={<Send size={16} />}
          onClick={handleSendInternal}
          loading={loading}
          disabled={(!inputValue.trim() && selectedPromptChips.length === 0) || disabled}
        />
      </Space.Compact>

      {showAgentDropdown && (
        <AgentDropdown>
          {filteredAgents.length > 0 ? (
            filteredAgents.map((agent, index) => (
              <AgentItem
                key={agent.id}
                onClick={() => handleAgentSelect(agent)}
                $isSelected={index === agentSelectedIndex}
              >
                <AgentItemContent>
                  <Bot size={16} />
                  <AgentItemName>@{agent.name}</AgentItemName>
                </AgentItemContent>
                {agent.description && (
                  <AgentItemDesc>{agent.description}</AgentItemDesc>
                )}
              </AgentItem>
            ))
          ) : (
            <AgentEmptyState>
              No agents found. Create one in Agents page.
            </AgentEmptyState>
          )}
        </AgentDropdown>
      )}

      {showPromptDropdown && (
        <PromptDropdown>
          {filteredTemplates.length > 0 ? (
            filteredTemplates.map((template, index) => (
              <PromptItem
                key={template.id}
                onClick={() => handleTemplateSelect(template)}
                $isSelected={index === promptSelectedIndex}
              >
                <PromptItemName>
                  {template.shortKey && (
                    <span
                      style={{
                        color: "#1890ff",
                        fontFamily: "Monaco, Consolas, monospace",
                        marginRight: "8px",
                      }}
                    >
                      /{template.shortKey}
                    </span>
                  )}
                  {template.name}
                </PromptItemName>
                {template.description && (
                  <PromptItemDesc>{template.description}</PromptItemDesc>
                )}
              </PromptItem>
            ))
          ) : (
            <PromptEmptyState>
              No templates found. Create one in My Prompts page.
            </PromptEmptyState>
          )}
        </PromptDropdown>
      )}

      {/* Prompt Chips */}
      {selectedPromptChips.length > 0 && (
        <PromptChipsContainer>
          {selectedPromptChips.map((chip) => (
            <PromptChip key={chip.id}>
              <PromptChipText>{chip.name}</PromptChipText>
              <PromptChipRemove onClick={() => handleRemoveChip(chip.id)}>
                ×
              </PromptChipRemove>
            </PromptChip>
          ))}
        </PromptChipsContainer>
      )}
    </InputContainer>
  );
};

const InputContainer = styled.div`
  padding: 16px 24px;
  border-top: 1px solid #f0f0f0;
  position: relative;
`;

const AgentDropdown = styled.div`
  position: absolute;
  bottom: 100%;
  left: 24px;
  right: 24px;
  margin-bottom: 8px;
  background: white;
  border: 1px solid #d9d9d9;
  border-radius: 8px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
  max-height: 300px;
  overflow-y: auto;
  z-index: 1001;
`;

const PromptDropdown = styled.div`
  position: absolute;
  bottom: 100%;
  left: 24px;
  right: 24px;
  margin-bottom: 8px;
  background: white;
  border: 1px solid #d9d9d9;
  border-radius: 8px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
  max-height: 300px;
  overflow-y: auto;
  z-index: 1000;
`;

const AgentItem = styled.div<{ $isSelected?: boolean }>`
  padding: 12px 16px;
  cursor: pointer;
  border-bottom: 1px solid #f0f0f0;
  transition: background-color 0.2s;
  background-color: ${props => props.$isSelected ? '#f6ffed' : 'transparent'};

  &:last-child {
    border-bottom: none;
  }

  &:hover {
    background-color: ${props => props.$isSelected ? '#d9f7be' : '#f5f5f5'};
  }
`;

const AgentItemContent = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 2px;
`;

const AgentItemName = styled.div`
  font-weight: 500;
  font-size: 14px;
  color: #52c41a;
`;

const AgentItemDesc = styled.div`
  font-size: 12px;
  color: #666;
  opacity: 0.8;
  margin-left: 24px;
`;

const AgentEmptyState = styled.div`
  padding: 20px;
  text-align: center;
  color: #999;
  font-size: 14px;
`;

const PromptItem = styled.div<{ $isSelected?: boolean }>`
  padding: 12px 16px;
  cursor: pointer;
  border-bottom: 1px solid #f0f0f0;
  transition: background-color 0.2s;
  background-color: ${props => props.$isSelected ? '#e6f7ff' : 'transparent'};

  &:last-child {
    border-bottom: none;
  }

  &:hover {
    background-color: ${props => props.$isSelected ? '#bae7ff' : '#f5f5f5'};
  }
`;

const PromptItemName = styled.div`
  font-weight: 500;
  font-size: 14px;
  color: #1890ff;
  margin-bottom: 2px;
`;

const PromptItemDesc = styled.div`
  font-size: 12px;
  color: #666;
  opacity: 0.8;
`;

const PromptEmptyState = styled.div`
  padding: 20px;
  text-align: center;
  color: #999;
  font-size: 14px;
`;

const PromptChipsContainer = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 8px;
  padding: 0 2px;
`;

const PromptChip = styled.div`
  display: inline-flex;
  align-items: center;
  background: #e6f4ff;
  border: 1px solid #91caff;
  border-radius: 16px;
  padding: 4px 12px;
  font-size: 12px;
  color: #1890ff;
  max-width: 200px;
`;

const PromptChipText = styled.span`
  margin-right: 6px;
  font-weight: 500;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
`;

const PromptChipRemove = styled.button`
  background: none;
  border: none;
  color: #1890ff;
  cursor: pointer;
  padding: 0;
  font-size: 16px;
  line-height: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 16px;
  height: 16px;
  border-radius: 50%;

  &:hover {
    background: rgba(24, 144, 255, 0.1);
  }
`;

export default MessageInput;