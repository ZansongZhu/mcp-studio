import React from "react";
import { Modal, Button, Tag, Spin } from "antd";
import { Settings } from "lucide-react";
import { MCPTool } from "@shared/types";

interface ToolsModalProps {
  visible: boolean;
  onClose: () => void;
  serverToolsList: Record<string, MCPTool[]>;
  servers: any[];
  loading: boolean;
}

const ToolsModal: React.FC<ToolsModalProps> = ({
  visible,
  onClose,
  serverToolsList,
  servers,
  loading,
}) => {
  return (
    <Modal
      title="Available MCP Tools"
      open={visible}
      onCancel={onClose}
      width={800}
      footer={[
        <Button key="close" onClick={onClose}>
          Close
        </Button>,
      ]}
      loading={loading}
    >
      {loading ? (
        <div style={{ textAlign: "center", padding: "20px" }}>
          <div>Loading tools...</div>
          <div style={{ marginTop: "10px" }}>
            <Spin size="large" />
          </div>
        </div>
      ) : (
        <div>
          {Object.keys(serverToolsList).length === 0 ? (
            <div style={{ textAlign: "center", padding: "20px" }}>
              No active MCP servers with tools found.
            </div>
          ) : (
            <div>
              {Object.entries(serverToolsList).map(([serverId, tools]) => {
                const server = servers.find((s) => s.id === serverId);
                if (!server) return null;

                return (
                  <div key={serverId} style={{ marginBottom: "24px" }}>
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        marginBottom: "12px",
                      }}
                    >
                      <Settings size={16} style={{ marginRight: "8px" }} />
                      <strong>{server.name}</strong>
                      <Tag color="blue" style={{ marginLeft: "8px" }}>
                        {tools.length} tools
                      </Tag>
                    </div>

                    {tools.length > 0 && (
                      <div style={{ marginLeft: "24px" }}>
                        {tools.map((tool) => (
                          <div
                            key={tool.id}
                            style={{
                              marginBottom: "12px",
                              padding: "8px",
                              background: "#f9f9f9",
                              borderRadius: "4px",
                            }}
                          >
                            <div style={{ fontWeight: 500 }}>{tool.name}</div>
                            {tool.description && (
                              <div
                                style={{
                                  fontSize: "14px",
                                  color: "#666",
                                  marginTop: "4px",
                                }}
                              >
                                {tool.description}
                              </div>
                            )}
                            {tool.inputSchema && (
                              <div
                                style={{
                                  fontSize: "12px",
                                  color: "#999",
                                  marginTop: "4px",
                                }}
                              >
                                <strong>Schema:</strong>
                                <pre
                                  style={{
                                    background: "#f5f5f5",
                                    padding: "4px",
                                    borderRadius: "4px",
                                    overflow: "auto",
                                  }}
                                >
                                  {JSON.stringify(tool.inputSchema, null, 2)}
                                </pre>
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </Modal>
  );
};

export default ToolsModal;