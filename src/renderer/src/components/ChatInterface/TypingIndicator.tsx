import React from "react";
import styled, { keyframes } from "styled-components";

interface TypingIndicatorProps {
  visible: boolean;
}

const TypingIndicator: React.FC<TypingIndicatorProps> = ({ visible }) => {
  if (!visible) return null;

  return (
    <Container>
      <TypingDots>
        <span></span>
        <span></span>
        <span></span>
      </TypingDots>
      <TypingText>Assistant is running...</TypingText>
    </Container>
  );
};

const typing = keyframes`
  0%,
  80%,
  100% {
    transform: scale(0.8);
    opacity: 0.5;
  }
  40% {
    transform: scale(1);
    opacity: 1;
  }
`;

const Container = styled.div`
  display: flex;
  align-items: center;
  padding: 16px;
  gap: 12px;
  opacity: 0.7;
`;

const TypingDots = styled.div`
  display: flex;
  gap: 4px;

  span {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background-color: #1890ff;
    animation: ${typing} 1.4s infinite ease-in-out;

    &:nth-child(1) {
      animation-delay: -0.32s;
    }

    &:nth-child(2) {
      animation-delay: -0.16s;
    }
  }
`;

const TypingText = styled.div`
  font-size: 14px;
  color: #666;
  font-style: italic;
`;

export default TypingIndicator;