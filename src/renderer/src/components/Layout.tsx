import React, { useState } from "react";
import { Layout as AntLayout, Menu } from "antd";
import { useNavigate, useLocation } from "react-router-dom";
import { MessageSquare, Settings, Cpu, FileText } from "lucide-react";
import styled from "styled-components";

const { Sider, Content } = AntLayout;

interface LayoutProps {
  children: React.ReactNode;
}

const Layout: React.FC<LayoutProps> = ({ children }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const [collapsed, setCollapsed] = useState(false);

  const menuItems = [
    {
      key: "/",
      icon: <MessageSquare size={16} />,
      label: "Assistant",
    },
    {
      key: "/prompts",
      icon: <FileText size={16} />,
      label: "My Prompts",
    },
    {
      key: "/mcp",
      icon: <Settings size={16} />,
      label: "MCP Servers",
    },
    {
      key: "/models",
      icon: <Cpu size={16} />,
      label: "Models",
    },
  ];

  return (
    <StyledLayout>
      <StyledSider
        width={200}
        collapsedWidth={48}
        theme="light"
        collapsible
        collapsed={collapsed}
        onCollapse={setCollapsed}
        trigger={null}
      >
        <Menu
          mode="inline"
          selectedKeys={[location.pathname]}
          items={menuItems}
          onClick={({ key }) => navigate(key)}
          style={{
            border: "none",
            height: "100vh",
          }}
        />
      </StyledSider>
      <SplitLine onClick={() => setCollapsed(!collapsed)} />
      <Content>
        <ContentWrapper>{children}</ContentWrapper>
        <Copyright>© 2025 zansong.zhu@gmail.com</Copyright>
      </Content>
    </StyledLayout>
  );
};

const StyledLayout = styled(AntLayout)`
  height: 100vh;
`;

const StyledSider = styled(Sider)`
  position: relative;

  .ant-layout-sider-trigger {
    display: none !important;
  }

  /* Adjust menu styling for narrow collapsed state */
  &.ant-layout-sider-collapsed {
    .ant-menu-item {
      padding: 0 !important;
      margin: 12px 0;
      display: flex;
      justify-content: center;
      align-items: center;
      width: 100%;
      height: 40px;
    }

    .ant-menu-item-icon {
      margin-right: 0 !important;
      font-size: 18px;
      display: flex !important;
      align-items: center;
      justify-content: center;
      opacity: 1 !important;
      visibility: visible !important;
    }

    .ant-menu-title-content {
      display: none !important;
    }

    .ant-menu-item-selected {
      background-color: #e6f4ff !important;
    }
  }
`;

const SplitLine = styled.div`
  width: 4px;
  background: #f0f0f0;
  cursor: pointer;
  position: relative;
  transition: all 0.2s;

  &:hover {
    background: #1890ff;
    width: 6px;
  }

  &::after {
    content: "";
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    width: 3px;
    height: 20px;
    background: transparent;
    border-radius: 2px;
  }

  &:hover::after {
    background: rgba(255, 255, 255, 0.8);
  }

  /* Adjust position for collapsed sidebar */
  ${StyledSider}.ant-layout-sider-collapsed + & {
    margin-left: -4px;
  }
`;

const ContentWrapper = styled.div`
  padding: 8px;
  height: 100%;
  overflow-y: auto;
  background: white;
  position: relative;
`;

const Copyright = styled.div`
  position: fixed;
  bottom: 8px;
  right: 8px;
  font-size: 11px;
  color: #999;
  opacity: 0.7;
  user-select: none;
  pointer-events: none;
  z-index: 1000;
`;

export default Layout;
