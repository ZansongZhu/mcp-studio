import React, { useState } from "react";
import { useSelector, useDispatch } from "react-redux";
import { List, Button, Typography, Popconfirm, Tag, Input } from "antd";
import { MessageSquare, Trash2, Edit2, Check, X } from "lucide-react";
import styled from "styled-components";
import { RootState } from "../../store";
import {
  setActiveConversation,
  deleteConversation,
  updateConversationTitle,
  selectAllConversations,
  selectActiveConversationId,
} from "../../store/assistantSlice";

const { Text } = Typography;

const ConversationList: React.FC = () => {
  const dispatch = useDispatch();
  const conversations = useSelector(selectAllConversations);
  const activeConversationId = useSelector(selectActiveConversationId);
  const { servers } = useSelector((state: RootState) => state.mcp);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");

  const handleSelectConversation = (id: string) => {
    dispatch(setActiveConversation(id));
  };

  const handleDeleteConversation = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    dispatch(deleteConversation(id));
  };

  const handleStartEdit = (
    id: string,
    currentTitle: string,
    e: React.MouseEvent,
  ) => {
    e.stopPropagation();
    setEditingId(id);
    setEditTitle(currentTitle);
  };

  const handleSaveEdit = (id: string) => {
    if (editTitle.trim()) {
      dispatch(updateConversationTitle({ id, title: editTitle.trim() }));
    }
    setEditingId(null);
    setEditTitle("");
  };

  const handleCancelEdit = () => {
    setEditingId(null);
    setEditTitle("");
  };

  const formatTime = (timestamp: number) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diffInHours = (now.getTime() - date.getTime()) / (1000 * 60 * 60);

    if (diffInHours < 24) {
      return date.toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      });
    } else if (diffInHours < 24 * 7) {
      return date.toLocaleDateString([], { weekday: "short" });
    } else {
      return date.toLocaleDateString([], { month: "short", day: "numeric" });
    }
  };

  return (
    <Container>
      <List
        dataSource={conversations}
        renderItem={(conversation) => (
          <ConversationItem
            key={conversation.id}
            isActive={conversation.id === activeConversationId}
            onClick={() => handleSelectConversation(conversation.id)}
          >
            <ItemContent>
              <IconWrapper>
                {conversation.isGenerating ? (
                  <GeneratingDots>
                    <span></span>
                    <span></span>
                    <span></span>
                  </GeneratingDots>
                ) : (
                  <MessageSquare size={16} />
                )}
              </IconWrapper>
              <TextContent>
                {editingId === conversation.id ? (
                  <EditContainer>
                    <Input
                      value={editTitle}
                      onChange={(e) => setEditTitle(e.target.value)}
                      onPressEnter={() => handleSaveEdit(conversation.id)}
                      onBlur={() => handleSaveEdit(conversation.id)}
                      autoFocus
                      size="small"
                      style={{ fontSize: "14px", fontWeight: 500 }}
                    />
                  </EditContainer>
                ) : (
                  <Title>{conversation.title}</Title>
                )}
                <Meta>
                  {conversation.messageIds.length} messages •{" "}
                  {formatTime(conversation.updatedAt)}
                  {conversation.mcpServerIds.length > 0 && (
                    <div>
                      <ServerTags>
                        {conversation.mcpServerIds
                          .slice(0, 2)
                          .map((serverId) => {
                            const server = servers.find(
                              (s) => s.id === serverId,
                            );
                            return server ? (
                              <Tag key={server.id} color="blue">
                                {server.name}
                              </Tag>
                            ) : null;
                          })}
                        {conversation.mcpServerIds.length > 2 && (
                          <Tag color="default">
                            +{conversation.mcpServerIds.length - 2} more
                          </Tag>
                        )}
                      </ServerTags>
                    </div>
                  )}
                </Meta>
              </TextContent>
              <ActionsWrapper>
                {editingId === conversation.id ? (
                  <>
                    <Button
                      type="text"
                      size="small"
                      icon={<Check size={14} />}
                      onClick={() => handleSaveEdit(conversation.id)}
                      style={{ opacity: 0.8, color: "#52c41a" }}
                    />
                    <Button
                      type="text"
                      size="small"
                      icon={<X size={14} />}
                      onClick={handleCancelEdit}
                      style={{ opacity: 0.8, color: "#8c8c8c" }}
                    />
                  </>
                ) : (
                  <>
                    <Button
                      type="text"
                      size="small"
                      icon={<Edit2 size={14} />}
                      onClick={(e) =>
                        handleStartEdit(conversation.id, conversation.title, e)
                      }
                      style={{ opacity: 0.8, color: "#1890ff" }}
                    />
                    <Popconfirm
                      title="Delete conversation?"
                      description="This action cannot be undone."
                      onConfirm={(e) =>
                        e && handleDeleteConversation(conversation.id, e)
                      }
                      okText="Delete"
                      cancelText="Cancel"
                    >
                      <Button
                        type="text"
                        size="small"
                        icon={<Trash2 size={16} />}
                        onClick={(e) => e.stopPropagation()}
                        style={{ opacity: 0.8, color: "#ff4d4f" }}
                      />
                    </Popconfirm>
                  </>
                )}
              </ActionsWrapper>
            </ItemContent>
          </ConversationItem>
        )}
      />
      {conversations.length === 0 && (
        <EmptyState>
          <MessageSquare size={32} style={{ opacity: 0.3, marginBottom: 8 }} />
          <Text type="secondary">No conversations yet</Text>
        </EmptyState>
      )}
    </Container>
  );
};

const Container = styled.div`
  flex: 1;
  overflow-y: auto;
  min-height: 0;
`;

const ConversationItem = styled.div<{ isActive: boolean }>`
  padding: 12px 16px;
  cursor: pointer;
  transition: background-color 0.2s;
  background-color: ${(props) => (props.isActive ? "#f0f8ff" : "transparent")};
  border-left: ${(props) =>
    props.isActive ? "3px solid #1890ff" : "3px solid transparent"};

  &:hover {
    background-color: ${(props) => (props.isActive ? "#f0f8ff" : "#fafafa")};

    .actions {
      opacity: 1;
    }
  }
`;

const ItemContent = styled.div`
  display: flex;
  align-items: flex-start;
  gap: 8px;
`;

const IconWrapper = styled.div`
  margin-top: 2px;
  color: #8c8c8c;
`;

const TextContent = styled.div`
  flex: 1;
  min-width: 0;
`;

const Title = styled.div`
  font-size: 14px;
  font-weight: 500;
  color: #262626;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  margin-bottom: 4px;
`;

const Meta = styled.div`
  font-size: 12px;
  color: #8c8c8c;
`;

const ServerTags = styled.div`
  margin-top: 4px;
  display: flex;
  gap: 4px;
  flex-wrap: wrap;
`;

const ActionsWrapper = styled.div`
  opacity: 0.3;
  transition: opacity 0.2s;
  margin-top: 2px;
  display: flex;
  gap: 4px;
`;

const EditContainer = styled.div`
  margin-bottom: 4px;
`;

const EmptyState = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 200px;
  color: #8c8c8c;
`;

const GeneratingDots = styled.div`
  display: flex;
  gap: 2px;

  span {
    width: 4px;
    height: 4px;
    border-radius: 50%;
    background-color: #1890ff;
    animation: pulse 1.4s infinite ease-in-out;

    &:nth-child(1) {
      animation-delay: -0.32s;
    }

    &:nth-child(2) {
      animation-delay: -0.16s;
    }
  }

  @keyframes pulse {
    0%,
    80%,
    100% {
      transform: scale(0.8);
      opacity: 0.4;
    }
    40% {
      transform: scale(1);
      opacity: 1;
    }
  }
`;

export default ConversationList;
