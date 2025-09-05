import React, { useState } from "react";
import { useSelector, useDispatch } from "react-redux";
import {
  Typography,
  Button,
  Card,
  Form,
  Input,
  Space,
  Modal,
  message,
  Popconfirm,
  Tag,
  Radio,
} from "antd";
import { Plus, Settings, Trash2, Key } from "lucide-react";
import styled from "styled-components";
import { RootState, store } from "../../store";
import {
  addProvider,
  updateProvider,
  removeProvider,
  setActiveModel,
} from "../../store/modelSlice";
import { ModelProvider } from "@shared/types";
import { useStorage } from "../../hooks/useStorage";

const { Title, Text } = Typography;

const ModelSettingsPage: React.FC = () => {
  const dispatch = useDispatch();
  const { saveProviders, saveActiveModelId } = useStorage();
  const { providers, activeModelId } = useSelector(
    (state: RootState) => state.model,
  );

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingProvider, setEditingProvider] = useState<ModelProvider | null>(
    null,
  );
  const [hoveredProvider, setHoveredProvider] = useState<string | null>(null);
  const [form] = Form.useForm();

  const handleAddProvider = () => {
    setEditingProvider(null);
    form.resetFields();
    setIsModalOpen(true);
  };

  const handleEditProvider = (provider: ModelProvider) => {
    setEditingProvider(provider);
    form.setFieldsValue(provider);
    setIsModalOpen(true);
  };

  const handleDeleteProvider = async (providerId: string) => {
    dispatch(removeProvider(providerId));
    // Save updated providers after deletion
    const updatedProviders = providers.filter((p) => p.id !== providerId);
    await saveProviders(updatedProviders);
    await window.api.ai.updateProviders(updatedProviders);
    message.success("Provider deleted successfully");
  };

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields();

      if (editingProvider) {
        const updatedProvider = { ...editingProvider, ...values };
        dispatch(updateProvider(updatedProvider));
        // Save updated providers after update
        const updatedProviders = providers.map((p) =>
          p.id === editingProvider.id ? updatedProvider : p,
        );
        await saveProviders(updatedProviders);
        await window.api.ai.updateProviders(updatedProviders);
        message.success("Provider updated successfully");
      } else {
        // Create new provider with proper structure and models
        const newProvider: Omit<ModelProvider, "id"> = {
          ...values,
          models: [] // Start with empty models array, user can configure later
        };
        
        // Dispatch to Redux store first
        dispatch(addProvider(newProvider));
        
        // Use a small delay to ensure Redux state is updated, then get current state
        setTimeout(async () => {
          try {
            const currentState = store.getState();
            const currentProviders = currentState.model.providers;
            await saveProviders(currentProviders);
            await window.api.ai.updateProviders(currentProviders);
          } catch (error) {
            console.error("Failed to save new provider:", error);
            message.error("Failed to save provider to storage");
          }
        }, 50);
        
        message.success("Provider added successfully");
      }

      setIsModalOpen(false);
      form.resetFields();
    } catch (error: any) {
      console.error("Form validation failed:", error);
      message.error("Failed to save provider");
    }
  };

  const handleModelChange = async (modelId: string) => {
    dispatch(setActiveModel(modelId));
    await saveActiveModelId(modelId);
    message.success("Active model updated");
  };

  const getProviderIcon = (providerId: string) => {
    switch (providerId.toLowerCase()) {
      case "openai":
        return "🤖";
      case "anthropic":
        return "🎭";
      case "google":
      case "gemini":
        return "🔍";
      case "mistral":
        return "🌪️";
      case "deepseek":
        return "🌊";
      case "qwen":
        return "🔤";
      case "ollama":
        return "🦙";
      default:
        return "🤖";
    }
  };

  const formatPrice = (price?: number) => {
    if (!price) return "N/A";
    return `$${price.toFixed(4)}/1K tokens`;
  };

  return (
    <Container>
      <Header>
        <Title level={2}>Model Settings</Title>
        <Button
          type="primary"
          icon={<Plus size={16} />}
          onClick={handleAddProvider}
        >
          Add Provider
        </Button>
      </Header>

      <ProvidersSection>
        <Title level={4}>Providers</Title>
        <Space direction="vertical" style={{ width: "100%" }} size="middle">
          {providers.map((provider) => {
            const activeModel = provider.models.find(
              (model) => model.id === activeModelId,
            );
            const isHovered = hoveredProvider === provider.id;
            return (
              <ProviderCard
                key={provider.id}
                onMouseEnter={() => setHoveredProvider(provider.id)}
                onMouseLeave={() => setHoveredProvider(null)}
              >
                <ProviderHeader>
                  <Space>
                    <span style={{ fontSize: "20px" }}>
                      {getProviderIcon(provider.id)}
                    </span>
                    <div>
                      <div style={{ fontWeight: 500, fontSize: "16px", display: "flex", alignItems: "center", gap: "8px" }}>
                        {provider.name}
                        {provider.apiKey || provider.id === 'ollama' ? (
                          <Tag color="green" icon={<Key size={12} />}>
                            {provider.id === 'ollama' 
                              ? (activeModelId === 'ollama' ? 'Default' : 'Ready')
                              : 'Configured'}
                          </Tag>
                        ) : (
                          <Tag color="orange" icon={<Key size={12} />}>
                            API Key Required
                          </Tag>
                        )}
                      </div>
                      {provider.id !== 'ollama' && (
                        <Text type="secondary" style={{ fontSize: "12px" }}>
                          {provider.models.length} models • {provider.baseUrl}
                          {provider.defaultModel && (
                            <> • Default: {provider.defaultModel}</>
                          )}
                        </Text>
                      )}
                    </div>
                  </Space>
                  <Space>
                    <Button
                      type="text"
                      size="small"
                      icon={<Settings size={14} />}
                      onClick={() => handleEditProvider(provider)}
                    />
                    <Popconfirm
                      title="Delete provider?"
                      description="This will remove the provider and all its models."
                      onConfirm={() => handleDeleteProvider(provider.id)}
                      okText="Delete"
                      cancelText="Cancel"
                    >
                      <Button
                        type="text"
                        size="small"
                        icon={<Trash2 size={14} />}
                        danger
                      />
                    </Popconfirm>
                  </Space>
                </ProviderHeader>

                {activeModel && provider.id !== 'ollama' && (
                  <ActiveModelDisplay>
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 8,
                        marginBottom: 8,
                      }}
                    >
                      <span style={{ fontWeight: 500, color: "#1890ff" }}>
                        Default Model:
                      </span>
                      <Tag color="blue">{activeModel.name}</Tag>
                    </div>
                    <ModelDetails>
                      <div>
                        Context:{" "}
                        {activeModel.contextLength?.toLocaleString() || "N/A"}{" "}
                        tokens
                      </div>
                      <div>
                        Max Output:{" "}
                        {activeModel.maxTokens?.toLocaleString() || "N/A"}{" "}
                        tokens
                      </div>
                      <div>
                        Input: {formatPrice(activeModel.pricing?.input)}
                      </div>
                      <div>
                        Output: {formatPrice(activeModel.pricing?.output)}
                      </div>
                    </ModelDetails>
                  </ActiveModelDisplay>
                )}

                <ModelsGrid>
                  {provider.id !== 'ollama' && provider.models.map((model) => (
                    <ModelTag
                      key={model.id}
                      color={model.id === activeModelId ? "blue" : "default"}
                    >
                      {model.name}
                    </ModelTag>
                  ))}
                </ModelsGrid>

                <ModelsFoldout isExpanded={isHovered}>
                  <div
                    style={{
                      fontWeight: 500,
                      marginBottom: 12,
                      color: "#1890ff",
                    }}
                  >
                    Select Model:
                  </div>
                  <Radio.Group
                    value={activeModelId}
                    onChange={(e) => handleModelChange(e.target.value)}
                    style={{ width: "100%" }}
                  >
                    <Space
                      direction="vertical"
                      style={{ width: "100%" }}
                      size="small"
                    >
                      {provider.id === 'ollama' && provider.defaultModel ? (
                        <ModelFoldoutItem key="ollama">
                          <Radio value="ollama">
                            <ModelFoldoutHeader>
                              <span style={{ fontWeight: 500 }}>
                                {provider.defaultModel}
                              </span>
                              {"ollama" === activeModelId && (
                                <Tag color="blue">Active</Tag>
                              )}
                            </ModelFoldoutHeader>
                          </Radio>
                          <ModelFoldoutDetails>
                            <div>
                              Provider: Ollama (Local)
                            </div>
                            <div>
                              Model: {provider.defaultModel}
                            </div>
                          </ModelFoldoutDetails>
                        </ModelFoldoutItem>
                      ) : (
                        provider.models.map((model) => (
                          <ModelFoldoutItem key={model.id}>
                            <Radio value={model.id}>
                              <ModelFoldoutHeader>
                                <span style={{ fontWeight: 500 }}>
                                  {model.name}
                                </span>
                                {model.id === activeModelId && (
                                  <Tag color="blue">Default</Tag>
                                )}
                              </ModelFoldoutHeader>
                            </Radio>
                            <ModelFoldoutDetails>
                              <div>
                                Context:{" "}
                                {model.contextLength?.toLocaleString() || "N/A"}{" "}
                                tokens
                              </div>
                              <div>
                                Max Output:{" "}
                                {model.maxTokens?.toLocaleString() || "N/A"}{" "}
                                tokens
                              </div>
                              <div>
                                Input: {formatPrice(model.pricing?.input)}
                              </div>
                              <div>
                                Output: {formatPrice(model.pricing?.output)}
                              </div>
                            </ModelFoldoutDetails>
                          </ModelFoldoutItem>
                        ))
                      )}
                    </Space>
                  </Radio.Group>
                </ModelsFoldout>
              </ProviderCard>
            );
          })}
        </Space>
      </ProvidersSection>

      <Modal
        title={editingProvider ? "Edit Provider" : "Add Provider"}
        open={isModalOpen}
        onOk={handleSubmit}
        onCancel={() => setIsModalOpen(false)}
        width={500}
        okText={editingProvider ? "Update" : "Add"}
      >
        <Form form={form} layout="vertical" style={{ marginTop: 16 }}>
          <Form.Item
            name="name"
            label="Name"
            rules={[{ required: true, message: "Please enter provider name" }]}
          >
            <Input placeholder="OpenAI" />
          </Form.Item>

          <Form.Item
            name="baseUrl"
            label="Base URL"
            rules={[{ required: true, message: "Please enter base URL" }]}
          >
            <Input placeholder="https://api.openai.com/v1" />
          </Form.Item>

          <Form.Item
            name="apiKey"
            label="API Key"
            rules={[
              {
                required: form.getFieldValue('baseUrl')?.includes('localhost') ? false : true,
                message: "Please enter API key"
              }
            ]}
          >
            <Input.Password placeholder="sk-... (not required for local Ollama)" />
          </Form.Item>

          <Form.Item noStyle shouldUpdate={(prevValues, currentValues) => 
            prevValues.name !== currentValues.name || 
            prevValues.baseUrl !== currentValues.baseUrl
          }>
            {() => {
              const currentName = form.getFieldValue('name') || '';
              const currentBaseUrl = form.getFieldValue('baseUrl') || '';
              const isOllama = currentName.toLowerCase().includes('ollama') || 
                              currentBaseUrl.includes('localhost:11434') ||
                              editingProvider?.id === 'ollama';
              
              return isOllama ? (
                <Form.Item
                  name="defaultModel"
                  label="Model Name"
                  rules={[
                    {
                      required: true,
                      message: "Please enter model name"
                    }
                  ]}
                >
                  <Input placeholder="model-name" />
                </Form.Item>
              ) : null;
            }}
          </Form.Item>

          <Text type="secondary" style={{ fontSize: '12px' }}>
            Note: After adding the provider, you can configure models in the provider settings.
          </Text>
        </Form>
      </Modal>
    </Container>
  );
};

const Container = styled.div`
  height: 100%;
`;

const Header = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 24px;
`;

const ProvidersSection = styled.div``;

const ModelDetails = styled.div`
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 4px 16px;
  font-size: 12px;
  color: #8c8c8c;
  margin-left: 24px;
`;

const ProviderCard = styled(Card)`
  .ant-card-body {
    padding: 20px;
  }
`;

const ProviderHeader = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 16px;
`;

const ModelsGrid = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 16px;
`;

const ModelTag = styled(Tag)`
  margin: 0;
`;

const ActiveModelDisplay = styled.div`
  background-color: #f6ffed;
  border: 1px solid #b7eb8f;
  border-radius: 6px;
  padding: 12px;
  margin-bottom: 16px;
`;

const ModelsFoldout = styled.div<{ isExpanded: boolean }>`
  max-height: ${(props) => (props.isExpanded ? "400px" : "0")};
  overflow: hidden;
  transition: max-height 0.3s ease-in-out;
  background-color: #fafafa;
  border-radius: 6px;
  margin: 16px 0;
  padding: ${(props) => (props.isExpanded ? "16px" : "0 16px")};
  opacity: ${(props) => (props.isExpanded ? 1 : 0)};
  transition:
    max-height 0.3s ease-in-out,
    opacity 0.3s ease-in-out,
    padding 0.3s ease-in-out;
`;

const ModelFoldoutItem = styled.div`
  margin-bottom: 12px;
  &:last-child {
    margin-bottom: 0;
  }
`;

const ModelFoldoutHeader = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 4px;
`;

const ModelFoldoutDetails = styled.div`
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 4px 16px;
  font-size: 12px;
  color: #8c8c8c;
  margin-left: 24px;
  padding-left: 8px;
  border-left: 2px solid #e0e0e0;
`;

export default ModelSettingsPage;
