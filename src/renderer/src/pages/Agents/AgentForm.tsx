import React, { useEffect } from "react";
import {
  Modal,
  Form,
  Input,
  Select,
  message,
} from "antd";
import { useSelector, useDispatch } from "react-redux";
import { RootState } from "../../store";
import { addAgent, updateAgent } from "../../store/agentSlice";
import { Agent } from "@shared/types";

const { Option } = Select;
const { TextArea } = Input;

interface AgentFormProps {
  visible: boolean;
  agent?: Agent | null;
  onClose: () => void;
  onAgentSaved?: () => void;
}

const AgentForm: React.FC<AgentFormProps> = ({ visible, agent, onClose, onAgentSaved }) => {
  const [form] = Form.useForm();
  const dispatch = useDispatch();
  
  const models = useSelector((state: RootState) => state.model.providers.flatMap(p => p.models));
  const mcpServers = useSelector((state: RootState) => state.mcp.servers);

  useEffect(() => {
    if (visible && agent) {
      form.setFieldsValue({
        name: agent.name,
        description: agent.description,
        modelId: agent.modelId,
        mcpServerIds: agent.mcpServerIds,
        systemInstructions: agent.systemInstructions,
      });
    } else if (visible) {
      form.resetFields();
    }
  }, [visible, agent, form]);

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields();
      
      if (agent) {
        dispatch(updateAgent({
          ...agent,
          ...values,
        }));
        message.success("Agent updated successfully");
      } else {
        dispatch(addAgent(values));
        message.success("Agent created successfully");
      }
      
      onClose();
      form.resetFields();
      
      // Notify parent that agent was saved
      if (onAgentSaved) {
        onAgentSaved();
      }
    } catch (error) {
      console.error("Form validation failed:", error);
    }
  };

  const handleCancel = () => {
    onClose();
    form.resetFields();
  };

  return (
    <Modal
      title={agent ? "Edit Agent" : "Create Agent"}
      open={visible}
      onOk={handleSubmit}
      onCancel={handleCancel}
      width={600}
      destroyOnHidden
    >
      <Form
        form={form}
        layout="vertical"
        requiredMark={false}
      >
        <Form.Item
          name="name"
          label="Name"
          rules={[
            { required: true, message: "Please enter agent name" },
            { max: 100, message: "Name must be less than 100 characters" },
          ]}
        >
          <Input placeholder="Enter agent name" />
        </Form.Item>

        <Form.Item
          name="description"
          label="Description"
          rules={[
            { max: 500, message: "Description must be less than 500 characters" },
          ]}
        >
          <TextArea
            placeholder="Enter agent description (optional)"
            rows={3}
            showCount
            maxLength={500}
          />
        </Form.Item>

        <Form.Item
          name="modelId"
          label="Language Model"
          rules={[
            { required: true, message: "Please select a language model" },
          ]}
        >
          <Select
            placeholder="Select a language model"
            showSearch
            filterOption={(input, option) =>
              option?.children?.toString().toLowerCase().includes(input.toLowerCase()) ?? false
            }
          >
            {models.map((model) => (
              <Option key={model.id} value={model.id}>
                {model.name}
              </Option>
            ))}
          </Select>
        </Form.Item>

        <Form.Item
          name="mcpServerIds"
          label="MCP Servers"
          help="Select MCP servers to provide tools and resources for this agent"
        >
          <Select
            mode="multiple"
            placeholder="Select MCP servers (optional)"
            showSearch
            filterOption={(input, option) =>
              option?.children?.toString().toLowerCase().includes(input.toLowerCase()) ?? false
            }
          >
            {mcpServers.filter(server => server.isActive).map((server) => (
              <Option key={server.id} value={server.id}>
                {server.name}
              </Option>
            ))}
          </Select>
        </Form.Item>

        <Form.Item
          name="systemInstructions"
          label="System Instructions"
          help="Define how the agent should behave and respond"
          rules={[
            { max: 10000, message: "System instructions must be less than 10,000 characters" },
          ]}
        >
          <TextArea
            placeholder="Enter system instructions for the agent (optional)"
            rows={6}
            showCount
            maxLength={10000}
          />
        </Form.Item>
      </Form>
    </Modal>
  );
};

export default AgentForm;