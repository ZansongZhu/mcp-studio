import React, { useState, useEffect } from "react";
import {
  Table,
  Button,
  Modal,
  Form,
  Input,
  Space,
  Popconfirm,
  Typography,
  message,
  Tag,
} from "antd";
import { Plus, Edit, Trash2, FileText } from "lucide-react";
import styled from "styled-components";

const { Title } = Typography;
const { TextArea } = Input;

interface PromptTemplate {
  id: string;
  name: string;
  description: string;
  shortKey: string;
  content: string;
  createdAt: number;
  updatedAt: number;
}

const PromptTemplatesPage: React.FC = () => {
  const [templates, setTemplates] = useState<PromptTemplate[]>([]);
  const [isModalVisible, setIsModalVisible] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<PromptTemplate | null>(
    null,
  );
  const [form] = Form.useForm();

  // Load templates from storage
  const loadTemplates = async () => {
    try {
      const stored = await window.api.storage.getPromptTemplates();
      setTemplates(stored || []);
    } catch (error) {
      console.error("Failed to load prompt templates:", error);
      message.error("Failed to load prompt templates");
    }
  };

  // Save templates to storage
  const saveTemplates = async (newTemplates: PromptTemplate[]) => {
    try {
      await window.api.storage.setPromptTemplates(newTemplates);
      setTemplates(newTemplates);
      message.success("Prompt templates saved successfully");
    } catch (error) {
      console.error("Failed to save prompt templates:", error);
      message.error("Failed to save prompt templates");
    }
  };

  useEffect(() => {
    loadTemplates();
  }, []);

  const handleAdd = () => {
    setEditingTemplate(null);
    setIsModalVisible(true);
    form.resetFields();
  };

  const handleEdit = (template: PromptTemplate) => {
    setEditingTemplate(template);
    setIsModalVisible(true);
    form.setFieldsValue({
      name: template.name,
      description: template.description,
      shortKey: template.shortKey,
      content: template.content,
    });
  };

  const handleDelete = async (id: string) => {
    const newTemplates = templates.filter((t) => t.id !== id);
    await saveTemplates(newTemplates);
  };

  const handleModalOk = async () => {
    try {
      const values = await form.validateFields();
      const now = Date.now();

      let newTemplates: PromptTemplate[];

      if (editingTemplate) {
        // Update existing template
        newTemplates = templates.map((t) =>
          t.id === editingTemplate.id ? { ...t, ...values, updatedAt: now } : t,
        );
      } else {
        // Create new template
        const newTemplate: PromptTemplate = {
          id: Date.now().toString(),
          ...values,
          createdAt: now,
          updatedAt: now,
        };
        newTemplates = [...templates, newTemplate];
      }

      await saveTemplates(newTemplates);
      setIsModalVisible(false);
      form.resetFields();
    } catch (error) {
      console.error("Form validation failed:", error);
    }
  };

  const handleModalCancel = () => {
    setIsModalVisible(false);
    form.resetFields();
    setEditingTemplate(null);
  };

  const columns = [
    {
      title: "Name",
      dataIndex: "name",
      key: "name",
      width: "25%",
      render: (text: string) => (
        <Space>
          <FileText size={16} />
          <span style={{ fontWeight: 500 }}>{text}</span>
        </Space>
      ),
    },
    {
      title: "Description",
      dataIndex: "description",
      key: "description",
      width: "25%",
      render: (text: string) => (
        <span
          style={{
            color: "#666",
            display: "block",
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          {text || "No description"}
        </span>
      ),
    },
    {
      title: "Short Key",
      dataIndex: "shortKey",
      key: "shortKey",
      width: "15%",
      render: (text: string) => (
        <Tag
          color="blue"
          style={{
            fontSize: "11px",
            fontFamily: "Monaco, Consolas, monospace",
          }}
        >
          {text || "-"}
        </Tag>
      ),
    },
    {
      title: "Content Preview",
      dataIndex: "content",
      key: "content",
      width: "25%",
      render: (text: string) => (
        <ContentPreview>
          {text.length > 50 ? `${text.substring(0, 50)}...` : text}
        </ContentPreview>
      ),
    },
    {
      title: "Updated",
      dataIndex: "updatedAt",
      key: "updatedAt",
      width: "10%",
      render: (timestamp: number) => (
        <span style={{ fontSize: "12px", color: "#666" }}>
          {new Date(timestamp).toLocaleDateString()}
        </span>
      ),
    },
    {
      title: "Actions",
      key: "actions",
      width: "10%",
      render: (_: any, record: PromptTemplate) => (
        <Space>
          <Button
            type="text"
            size="small"
            icon={<Edit size={14} />}
            onClick={() => handleEdit(record)}
          />
          <Popconfirm
            title="Delete template?"
            description="This action cannot be undone."
            onConfirm={() => handleDelete(record.id)}
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
      ),
    },
  ];

  return (
    <Container>
      <Header>
        <Title level={2}>My Prompts</Title>
        <Button type="primary" icon={<Plus size={16} />} onClick={handleAdd}>
          Add Template
        </Button>
      </Header>

      <TableContainer>
        <Table
          columns={columns}
          dataSource={templates}
          rowKey="id"
          size="middle"
          pagination={{
            pageSize: 15,
            showSizeChanger: true,
            showQuickJumper: true,
            showTotal: (total) => `Total ${total} templates`,
          }}
          locale={{
            emptyText: (
              <EmptyState>
                <FileText
                  size={48}
                  style={{ opacity: 0.3, marginBottom: 16 }}
                />
                <p>No prompt templates yet</p>
                <Button
                  type="primary"
                  icon={<Plus size={16} />}
                  onClick={handleAdd}
                >
                  Create your first template
                </Button>
              </EmptyState>
            ),
          }}
        />
      </TableContainer>

      <Modal
        title={editingTemplate ? "Edit Prompt Template" : "Add Prompt Template"}
        open={isModalVisible}
        onOk={handleModalOk}
        onCancel={handleModalCancel}
        width={800}
        okText={editingTemplate ? "Update" : "Create"}
      >
        <Form form={form} layout="vertical">
          <Form.Item
            name="name"
            label="Template Name"
            rules={[
              { required: true, message: "Please enter a template name" },
            ]}
          >
            <Input placeholder="Enter template name" />
          </Form.Item>

          <Form.Item name="description" label="Description">
            <Input placeholder="Enter description (optional)" />
          </Form.Item>

          <Form.Item name="shortKey" label="Short Key">
            <Input
              placeholder="Enter short key (optional)"
              style={{ fontFamily: "Monaco, Consolas, monospace" }}
            />
          </Form.Item>

          <Form.Item
            name="content"
            label="Prompt Content"
            rules={[{ required: true, message: "Please enter prompt content" }]}
          >
            <TextArea
              rows={10}
              placeholder="Enter your prompt template content..."
              style={{ fontFamily: "Monaco, Consolas, monospace" }}
            />
          </Form.Item>
        </Form>
      </Modal>
    </Container>
  );
};

const Container = styled.div`
  height: 100%;
  display: flex;
  flex-direction: column;
`;

const Header = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 24px;
`;

const TableContainer = styled.div`
  flex: 1;
  overflow: auto;
`;

const ContentPreview = styled.div`
  font-family: Monaco, Consolas, monospace;
  font-size: 12px;
  color: #666;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
`;

const EmptyState = styled.div`
  text-align: center;
  padding: 40px;
  color: #999;
`;

export default PromptTemplatesPage;
