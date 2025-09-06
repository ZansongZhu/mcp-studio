import React, { useState, useEffect } from "react";
import { Card, Button, Table, Space, Popconfirm, message } from "antd";
import { PlusOutlined, EditOutlined, DeleteOutlined } from "@ant-design/icons";
import { useSelector, useDispatch } from "react-redux";
import { RootState } from "../../store";
import { removeAgent } from "../../store/agentSlice";
import { useStorage } from "../../hooks/useStorage";
import { Agent } from "@shared/types";
import AgentForm from "./AgentForm";
import styled from "styled-components";

const AgentsPage: React.FC = () => {
  const dispatch = useDispatch();
  const agents = useSelector((state: RootState) => state.agent.agents);
  const models = useSelector((state: RootState) => state.model.providers.flatMap(p => p.models));
  const mcpServers = useSelector((state: RootState) => state.mcp.servers);
  const { saveAgents } = useStorage();

  const [showForm, setShowForm] = useState(false);
  const [editingAgent, setEditingAgent] = useState<Agent | null>(null);
  const [shouldSave, setShouldSave] = useState(false);

  // Save agents whenever they change (after add/update)
  useEffect(() => {
    if (shouldSave) {
      saveAgents(agents);
      setShouldSave(false);
    }
  }, [agents, shouldSave, saveAgents]);

  const handleEdit = (agent: Agent) => {
    setEditingAgent(agent);
    setShowForm(true);
  };

  const handleDelete = async (agentId: string) => {
    dispatch(removeAgent(agentId));
    // Save updated agents list to storage
    const updatedAgents = agents.filter(agent => agent.id !== agentId);
    await saveAgents(updatedAgents);
    message.success("Agent deleted successfully");
  };

  const handleFormClose = () => {
    setShowForm(false);
    setEditingAgent(null);
  };

  const handleAgentSaved = () => {
    // Trigger save after agent changes
    setShouldSave(true);
  };


  const getModelName = (modelId: string) => {
    const model = models.find(m => m.id === modelId);
    return model ? model.name : modelId;
  };

  const getMcpServerNames = (serverIds: string[]) => {
    return serverIds
      .map(id => {
        const server = mcpServers.find(s => s.id === id);
        return server ? server.name : id;
      })
      .join(", ");
  };

  const columns = [
    {
      title: "Name",
      dataIndex: "name",
      key: "name",
    },
    {
      title: "Description",
      dataIndex: "description",
      key: "description",
      render: (text: string) => text || "-",
    },
    {
      title: "Model",
      dataIndex: "modelId",
      key: "modelId",
      render: (modelId: string) => getModelName(modelId),
    },
    {
      title: "MCP Servers",
      dataIndex: "mcpServerIds",
      key: "mcpServerIds",
      render: (serverIds: string[]) => getMcpServerNames(serverIds) || "None",
    },
    {
      title: "Actions",
      key: "actions",
      render: (_: any, record: Agent) => (
        <Space>
          <Button
            size="small"
            icon={<EditOutlined />}
            onClick={() => handleEdit(record)}
          />
          <Popconfirm
            title="Are you sure you want to delete this agent?"
            onConfirm={() => handleDelete(record.id)}
            okText="Yes"
            cancelText="No"
          >
            <Button
              size="small"
              icon={<DeleteOutlined />}
              danger
            />
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <PageContainer>
      <StyledCard
        title="Agents"
        extra={
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={() => setShowForm(true)}
          >
            Add Agent
          </Button>
        }
      >
        <Table
          dataSource={agents}
          columns={columns}
          rowKey="id"
          pagination={false}
          locale={{
            emptyText: "No agents configured. Create your first agent to get started.",
          }}
        />
      </StyledCard>

      <AgentForm
        visible={showForm}
        agent={editingAgent}
        onClose={handleFormClose}
        onAgentSaved={handleAgentSaved}
      />
    </PageContainer>
  );
};

const PageContainer = styled.div`
  padding: 24px;
  height: 100%;
  overflow-y: auto;
`;

const StyledCard = styled(Card)`
  .ant-card-body {
    padding: 24px;
  }
`;


export default AgentsPage;