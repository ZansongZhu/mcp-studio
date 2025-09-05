import React, { Component, ErrorInfo, ReactNode } from "react";
import { Button, Card, Typography, Space, Alert } from "antd";
import { RefreshCw, Bug, Download } from "lucide-react";
import styled from "styled-components";
import { logger } from "@shared/monitoring";

const { Title, Text, Paragraph } = Typography;

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
  onError?: (error: Error, errorInfo: ErrorInfo) => void;
}

interface State {
  hasError: boolean;
  error?: Error;
  errorInfo?: ErrorInfo;
  errorId: string;
}

class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = {
      hasError: false,
      errorId: "",
    };
  }

  static getDerivedStateFromError(_error: Error): Partial<State> {
    // Update state to show error UI
    return {
      hasError: true,
      errorId: `error_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    const errorId = `error_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    // Log the error
    logger.error("React Error Boundary caught an error", {
      errorId,
      errorMessage: error.message,
      errorStack: error.stack,
      componentStack: errorInfo.componentStack,
      errorBoundary: true,
    }, error);

    this.setState({
      error,
      errorInfo,
      errorId,
    });

    // Call custom error handler if provided
    this.props.onError?.(error, errorInfo);
  }

  handleReload = () => {
    // Try to recover by reloading the component
    this.setState({
      hasError: false,
      error: undefined,
      errorInfo: undefined,
      errorId: "",
    });
  };

  handleRestart = () => {
    // Reload the entire application
    window.location.reload();
  };

  handleDownloadLogs = () => {
    try {
      const logs = logger.exportLogs();
      const blob = new Blob([logs], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      
      const link = document.createElement('a');
      link.href = url;
      link.download = `mcp-studio-error-logs-${this.state.errorId}.json`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      
      URL.revokeObjectURL(url);
    } catch (downloadError) {
      logger.error("Failed to download error logs", {}, downloadError as Error);
    }
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <ErrorContainer>
          <ErrorCard>
            <Space direction="vertical" size="large" style={{ width: "100%" }}>
              <div style={{ textAlign: "center" }}>
                <Bug size={48} color="#ff4d4f" />
                <Title level={3} style={{ color: "#ff4d4f", marginTop: 16 }}>
                  Something went wrong
                </Title>
              </div>

              <Alert
                message="Application Error"
                description={
                  <div>
                    <Paragraph>
                      An unexpected error occurred. This has been automatically logged for investigation.
                    </Paragraph>
                    {this.state.error && (
                      <details>
                        <summary style={{ cursor: "pointer", marginBottom: 8 }}>
                          <Text type="secondary">View technical details</Text>
                        </summary>
                        <ErrorDetails>
                          <Text code>{this.state.error.message}</Text>
                          {this.state.error.stack && (
                            <pre style={{ 
                              fontSize: "12px", 
                              overflow: "auto", 
                              maxHeight: "200px",
                              background: "#f5f5f5",
                              padding: "8px",
                              borderRadius: "4px",
                              marginTop: "8px"
                            }}>
                              {this.state.error.stack}
                            </pre>
                          )}
                        </ErrorDetails>
                      </details>
                    )}
                  </div>
                }
                type="error"
                showIcon
              />

              <Space wrap style={{ justifyContent: "center" }}>
                <Button
                  type="primary"
                  icon={<RefreshCw size={16} />}
                  onClick={this.handleReload}
                >
                  Try Again
                </Button>
                
                <Button
                  icon={<RefreshCw size={16} />}
                  onClick={this.handleRestart}
                >
                  Restart App
                </Button>

                <Button
                  icon={<Download size={16} />}
                  onClick={this.handleDownloadLogs}
                >
                  Download Logs
                </Button>
              </Space>

              <div style={{ textAlign: "center" }}>
                <Text type="secondary" style={{ fontSize: "12px" }}>
                  Error ID: {this.state.errorId}
                </Text>
              </div>
            </Space>
          </ErrorCard>
        </ErrorContainer>
      );
    }

    return this.props.children;
  }
}

const ErrorContainer = styled.div`
  display: flex;
  justify-content: center;
  align-items: center;
  min-height: 400px;
  padding: 20px;
`;

const ErrorCard = styled(Card)`
  max-width: 600px;
  width: 100%;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
`;

const ErrorDetails = styled.div`
  margin-top: 12px;
  padding: 12px;
  background: #fafafa;
  border-radius: 6px;
  border: 1px solid #d9d9d9;
`;

export default ErrorBoundary;