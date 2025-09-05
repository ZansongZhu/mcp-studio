import React, { useState, useEffect } from "react";
import { Card, Statistic, Row, Col, Table, Button, Modal, Typography, Space, Tag } from "antd";
import { Activity, Clock, CheckCircle, AlertCircle, Download, RefreshCw } from "lucide-react";
import { logger, metricsCollector } from "@shared/monitoring";

const { Text } = Typography;

interface MonitoringDashboardProps {
  visible: boolean;
  onClose: () => void;
}

const MonitoringDashboard: React.FC<MonitoringDashboardProps> = ({ visible, onClose }) => {
  const [summary, setSummary] = useState<any>({});
  const [logs, setLogs] = useState<any[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    if (visible) {
      refreshData();
    }
  }, [visible]);

  const refreshData = async () => {
    setRefreshing(true);
    try {
      const metricsSummary = metricsCollector.getMetricsSummary();
      const recentLogs = logger.getLogs().slice(-50); // Last 50 logs
      
      setSummary(metricsSummary);
      setLogs(recentLogs);
    } catch (error) {
      console.error("Failed to refresh monitoring data:", error);
    } finally {
      setRefreshing(false);
    }
  };

  const handleDownloadLogs = () => {
    try {
      const allLogs = logger.exportLogs();
      const blob = new Blob([allLogs], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      
      const link = document.createElement('a');
      link.href = url;
      link.download = `mcp-studio-logs-${new Date().toISOString().split('T')[0]}.json`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error("Failed to download logs:", error);
    }
  };

  const handleDownloadMetrics = () => {
    try {
      const metrics = metricsCollector.exportMetrics();
      const blob = new Blob([JSON.stringify(metrics, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      
      const link = document.createElement('a');
      link.href = url;
      link.download = `mcp-studio-metrics-${new Date().toISOString().split('T')[0]}.json`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error("Failed to download metrics:", error);
    }
  };

  const logColumns = [
    {
      title: 'Time',
      dataIndex: 'timestamp',
      key: 'timestamp',
      width: 180,
      render: (timestamp: number) => new Date(timestamp).toLocaleString(),
    },
    {
      title: 'Level',
      dataIndex: 'level',
      key: 'level',
      width: 80,
      render: (level: string) => {
        const color = {
          error: 'red',
          warn: 'orange',
          info: 'blue',
          debug: 'gray',
        }[level] || 'default';
        
        return <Tag color={color}>{level.toUpperCase()}</Tag>;
      },
    },
    {
      title: 'Message',
      dataIndex: 'message',
      key: 'message',
      render: (message: string, record: any) => (
        <div>
          <Text>{message}</Text>
          {record.context && (
            <details style={{ marginTop: 4 }}>
              <summary style={{ cursor: 'pointer', fontSize: '12px', color: '#666' }}>
                Context
              </summary>
              <pre style={{ 
                fontSize: '11px', 
                background: '#f5f5f5', 
                padding: '4px', 
                borderRadius: '2px',
                marginTop: '4px',
                maxHeight: '100px',
                overflow: 'auto'
              }}>
                {JSON.stringify(record.context, null, 2)}
              </pre>
            </details>
          )}
        </div>
      ),
    },
  ];

  return (
    <Modal
      title={
        <Space>
          <Activity size={20} />
          <span>Monitoring Dashboard</span>
        </Space>
      }
      open={visible}
      onCancel={onClose}
      width={1200}
      footer={[
        <Button key="refresh" icon={<RefreshCw size={16} />} onClick={refreshData} loading={refreshing}>
          Refresh
        </Button>,
        <Button key="logs" icon={<Download size={16} />} onClick={handleDownloadLogs}>
          Download Logs
        </Button>,
        <Button key="metrics" icon={<Download size={16} />} onClick={handleDownloadMetrics}>
          Download Metrics
        </Button>,
        <Button key="close" type="primary" onClick={onClose}>
          Close
        </Button>,
      ]}
    >
      <Space direction="vertical" size="large" style={{ width: '100%' }}>
        {/* Metrics Summary */}
        <Card title="Application Metrics" size="small">
          <Row gutter={16}>
            <Col span={6}>
              <Statistic
                title="Tool Executions"
                value={summary.toolExecutions || 0}
                prefix={<Activity size={16} />}
              />
            </Col>
            <Col span={6}>
              <Statistic
                title="Conversations"
                value={summary.conversations || 0}
                prefix={<CheckCircle size={16} />}
              />
            </Col>
            <Col span={6}>
              <Statistic
                title="Success Rate"
                value={summary.successRate || 0}
                suffix="%"
                prefix={<CheckCircle size={16} />}
                valueStyle={{ 
                  color: (summary.successRate || 0) > 90 ? '#3f8600' : '#cf1322' 
                }}
              />
            </Col>
            <Col span={6}>
              <Statistic
                title="Avg Tool Time"
                value={summary.averageToolExecutionTime || 0}
                suffix="ms"
                prefix={<Clock size={16} />}
                precision={2}
              />
            </Col>
          </Row>
          
          {summary.mostUsedTool && (
            <div style={{ marginTop: 16 }}>
              <Text type="secondary">Most used tool: </Text>
              <Tag color="blue">{summary.mostUsedTool}</Tag>
            </div>
          )}
        </Card>

        {/* Recent Logs */}
        <Card 
          title={
            <Space>
              <AlertCircle size={16} />
              <span>Recent Logs</span>
              <Tag color="blue">{logs.length}</Tag>
            </Space>
          }
          size="small"
        >
          <Table
            dataSource={logs.map((log, index) => ({ ...log, key: index }))}
            columns={logColumns}
            pagination={{
              pageSize: 10,
              size: 'small',
              showSizeChanger: true,
              showQuickJumper: true,
            }}
            size="small"
            scroll={{ y: 300 }}
          />
        </Card>
      </Space>
    </Modal>
  );
};

export default MonitoringDashboard;