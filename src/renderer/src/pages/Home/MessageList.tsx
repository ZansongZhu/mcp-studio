import React, { useEffect, useRef, useState } from "react";
import { useSelector } from "react-redux";
import {
  Avatar,
  Typography,
  Space,
  Tag,
  Button,
  message as antMessage,
} from "antd";
import { Bot, User, Settings, Copy, Check } from "lucide-react";
import styled from "styled-components";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  LineElement,
  PointElement,
  Title,
  Tooltip,
  Legend,
  ArcElement,
} from "chart.js";
import { Bar, Line, Pie } from "react-chartjs-2";
import { 
  Conversation, 
  Message, 
  selectConversationMessages,
  selectAllToolCalls
} from "../../store/assistantSlice";
import { RootState } from "../../store";

// Register Chart.js components
ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  LineElement,
  PointElement,
  Title,
  Tooltip,
  Legend,
  ArcElement,
);

const { Text } = Typography;

// Chart component for rendering data visualizations
const ChartRenderer: React.FC<{ content: string }> = ({ content }) => {
  try {
    // Try to parse chart data from JSON blocks
    const chartRegex = /```chart\s*\n([\s\S]*?)\n```/g;
    const matches = chartRegex.exec(content);

    if (matches && matches[1]) {
      const chartData = JSON.parse(matches[1]);
      const { type, data, options = {} } = chartData;

      const chartOptions = {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            position: "top" as const,
            labels: {
              color: "inherit",
            },
          },
          tooltip: {
            backgroundColor: "rgba(0, 0, 0, 0.8)",
            titleColor: "white",
            bodyColor: "white",
          },
        },
        scales:
          type !== "pie"
            ? {
                x: {
                  ticks: {
                    color: "inherit",
                  },
                  grid: {
                    color: "rgba(255, 255, 255, 0.1)",
                  },
                },
                y: {
                  ticks: {
                    color: "inherit",
                  },
                  grid: {
                    color: "rgba(255, 255, 255, 0.1)",
                  },
                },
              }
            : undefined,
        ...options,
      };

      return (
        <ChartContainer>
          {type === "bar" && (
            <Bar data={data} options={chartOptions} height={300} />
          )}
          {type === "line" && (
            <Line data={data} options={chartOptions} height={300} />
          )}
          {type === "pie" && (
            <Pie data={data} options={chartOptions} height={300} />
          )}
        </ChartContainer>
      );
    }
  } catch (error) {
    console.warn("Chart parsing error:", error);
  }

  return null;
};

// Simple text renderer that handles charts but not markdown
const SimpleContentRenderer: React.FC<{ content: string }> = ({ content }) => {
  const hasChart = /```chart\s*\n([\s\S]*?)\n```/g.test(content);
  
  // Remove chart blocks from text content
  const textContent = content.replace(/```chart\s*\n([\s\S]*?)\n```/g, "");

  return (
    <>
      {hasChart && <ChartRenderer content={content} />}
      <div style={{ whiteSpace: "pre-wrap", wordWrap: "break-word" }}>
        {textContent}
      </div>
    </>
  );
};


interface MessageListProps {
  conversation: Conversation;
}

const MessageList: React.FC<MessageListProps> = ({ conversation }) => {
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [copiedMessageId, setCopiedMessageId] = useState<string | null>(null);
  const messages = useSelector((state: RootState) => selectConversationMessages(state, conversation.id));
  const allToolCalls = useSelector(selectAllToolCalls);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const formatTime = (timestamp: number) => {
    return new Date(timestamp).toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const copyToClipboard = async (text: string, messageId: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedMessageId(messageId);
      antMessage.success("Message copied to clipboard");

      // Reset copied state after 2 seconds
      setTimeout(() => {
        setCopiedMessageId(null);
      }, 2000);
    } catch (error) {
      console.error("Failed to copy text:", error);
      antMessage.error("Failed to copy message");
    }
  };

  const renderMessage = (message: Message) => {
    const isUser = message.role === "user";
    const isSystem = message.role === "system";

    return (
      <MessageContainer key={message.id} isUser={isUser} isSystem={isSystem}>
        <MessageContent isUser={isUser} isSystem={isSystem}>
          <MessageHeader>
            <Space align="center">
              <Avatar
                size="small"
                icon={
                  isUser ? (
                    <User size={16} />
                  ) : isSystem ? (
                    <Settings size={16} />
                  ) : (
                    <Bot size={16} />
                  )
                }
                style={{
                  backgroundColor: isUser
                    ? "#1890ff"
                    : isSystem
                      ? "#52c41a"
                      : "#722ed1",
                }}
              />
              <Text strong style={{ fontSize: "14px" }}>
                {isUser ? "You" : isSystem ? "System" : "Assistant"}
              </Text>
              <Text type="secondary" style={{ fontSize: "12px" }}>
                {formatTime(message.timestamp)}
              </Text>
              {message.modelId && !isUser && (
                <Tag color="blue">{message.modelId}</Tag>
              )}
            </Space>
            <CopyButton
              type="text"
              size="small"
              icon={
                copiedMessageId === message.id ? (
                  <Check size={14} />
                ) : (
                  <Copy size={14} />
                )
              }
              onClick={(e) => {
                e.stopPropagation();
                copyToClipboard(message.content, message.id);
              }}
              style={{
                opacity: copiedMessageId === message.id ? 1 : 0.6,
                color: copiedMessageId === message.id ? "#52c41a" : "inherit",
              }}
              title="Copy message"
            />
          </MessageHeader>

          <MessageText>
            <SimpleContentRenderer content={message.content} />
          </MessageText>

          {message.toolCallIds && message.toolCallIds.length > 0 && (
            <ToolCallsContainer>
              {message.toolCallIds.map((toolCallId) => {
                const toolCall = allToolCalls.find(tc => tc.id === toolCallId);
                if (!toolCall) return null;
                return (
                <ToolCallItem key={toolCall.id}>
                  <ToolCallHeader>
                    <Space>
                      <Settings size={14} />
                      <span>{toolCall.name}</span>
                      <Tag>{toolCall.serverName}</Tag>
                    </Space>
                    <Button
                      type="text"
                      size="small"
                      icon={<Copy size={12} />}
                      onClick={(e) => {
                        e.stopPropagation();
                        const toolCallText = `Tool: ${toolCall.name}\nServer: ${toolCall.serverName}\nResult: ${toolCall.result ? JSON.stringify(toolCall.result, null, 2) : toolCall.error || "No result"}`;
                        copyToClipboard(toolCallText, `tool-${toolCall.id}`);
                      }}
                      style={{ opacity: 0.6 }}
                      title="Copy tool call result"
                    />
                  </ToolCallHeader>
                  {toolCall.result && (
                    <ToolCallResult>
                      <Text code>
                        {JSON.stringify(toolCall.result, null, 2)}
                      </Text>
                    </ToolCallResult>
                  )}
                  {toolCall.error && (
                    <ToolCallError>
                      <Text type="danger">{toolCall.error}</Text>
                    </ToolCallError>
                  )}
                </ToolCallItem>
                );
              })}
            </ToolCallsContainer>
          )}
        </MessageContent>
      </MessageContainer>
    );
  };

  return (
    <Container>
      {messages.map(renderMessage)}
      <div ref={messagesEndRef} />
    </Container>
  );
};

const Container = styled.div`
  display: flex;
  flex-direction: column;
  gap: 16px;
`;

const MessageContainer = styled.div<{ isUser: boolean; isSystem: boolean }>`
  display: flex;
  justify-content: ${(props) => (props.isUser ? "flex-end" : "flex-start")};
`;

const MessageContent = styled.div<{ isUser: boolean; isSystem: boolean }>`
  ${(props) => props.isUser ? "max-width: 70%;" : "width: 100%;"}
  background: ${(props) =>
    props.isUser ? "#1890ff" : props.isSystem ? "#f6ffed" : "#fafafa"};
  border-radius: 12px;
  padding: 12px 16px;
  color: ${(props) => (props.isUser ? "white" : "inherit")};
  position: relative;

  &:hover .copy-button {
    opacity: 1;
  }
`;

const MessageHeader = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
  opacity: 0.8;
`;

const MessageText = styled.div`
  line-height: 1.5;
`;

const ToolCallsContainer = styled.div`
  margin-top: 12px;
  display: flex;
  flex-direction: column;
  gap: 8px;
`;

const ToolCallItem = styled.div`
  background: rgba(255, 255, 255, 0.1);
  border-radius: 8px;
  padding: 8px 12px;
`;

const ToolCallHeader = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 12px;
  font-weight: 500;
  margin-bottom: 6px;

  > * {
    display: flex;
    align-items: center;
    gap: 6px;
  }
`;

const ToolCallResult = styled.div`
  font-size: 12px;
  opacity: 0.9;
`;

const ToolCallError = styled.div`
  font-size: 12px;
`;

const ChartContainer = styled.div`
  margin: 16px 0;
  padding: 16px;
  background: rgba(255, 255, 255, 0.05);
  border-radius: 8px;
  height: 300px;
`;

const CopyButton = styled(Button)`
  opacity: 0.3;
  transition: opacity 0.2s ease;

  &:hover {
    opacity: 1 !important;
  }
`;

export default MessageList;
