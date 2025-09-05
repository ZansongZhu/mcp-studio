import React, { useRef, useState } from "react";
import { Button, Input, Space } from "antd";
import { Send } from "lucide-react";
import styled from "styled-components";
import { usePromptTemplates } from "../../hooks/usePromptTemplates";

const { TextArea } = Input;

interface MessageInputProps {
  onSendMessage: (message: string) => Promise<any>;
  disabled?: boolean;
  loading?: boolean;
}

const MessageInput: React.FC<MessageInputProps> = ({
  onSendMessage,
  disabled = false,
  loading = false,
}) => {
  const [inputValue, setInputValue] = useState("");
  const textAreaRef = useRef<any>(null);

  const {
    filteredTemplates,
    selectedPromptChips,
    showPromptDropdown,
    selectedIndex,
    handleInputChange,
    handleSelectTemplate,
    handleRemoveChip,
    buildMessageContent,
    clearChips,
    handleKeyDown,
  } = usePromptTemplates();

  const handleInputChangeInternal = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const value = e.target.value;
    setInputValue(value);
    
    const cursor = e.target.selectionStart;
    handleInputChange(value, cursor);
  };

  const handleSendInternal = async () => {
    const messageContent = buildMessageContent(inputValue);
    if (!messageContent.trim()) return;

    const result = await onSendMessage(messageContent);
    
    // Only clear input and chips if message was sent successfully
    if (result && !result.isToolsCommand) {
      setInputValue("");
      clearChips();
    }
  };

  const handleKeyDownInternal = (e: React.KeyboardEvent) => {
    const result = handleKeyDown(e, handleSendInternal);
    
    if (result?.selectTemplateAtIndex !== undefined && filteredTemplates.length > 0) {
      const template = filteredTemplates[result.selectTemplateAtIndex];
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

  return (
    <InputContainer>
      <Space.Compact style={{ width: "100%" }}>
        <TextArea
          ref={textAreaRef}
          value={inputValue}
          onChange={handleInputChangeInternal}
          onKeyDown={handleKeyDownInternal}
          placeholder="Type your message... (use /[short key] to insert templates)"
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

      {showPromptDropdown && (
        <PromptDropdown>
          {filteredTemplates.length > 0 ? (
            filteredTemplates.map((template, index) => (
              <PromptItem
                key={template.id}
                onClick={() => handleTemplateSelect(template)}
                $isSelected={index === selectedIndex}
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