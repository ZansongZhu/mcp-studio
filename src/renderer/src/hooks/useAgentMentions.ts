import { useState, useMemo } from "react";
import { useSelector } from "react-redux";
import { RootState } from "../store";
import { Agent } from "@shared/types";

interface AgentMention {
  id: string;
  name: string;
  startIndex: number;
  endIndex: number;
}

export const useAgentMentions = () => {
  const agents = useSelector((state: RootState) => state.agent.agents);
  const [inputValue, setInputValue] = useState("");
  const [cursorPosition, setCursorPosition] = useState(0);
  const [showAgentDropdown, setShowAgentDropdown] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [currentMention, setCurrentMention] = useState<{
    startIndex: number;
    query: string;
  } | null>(null);

  // Get agents filtered by current mention query
  const filteredAgents = useMemo(() => {
    if (!currentMention) return [];
    
    const query = currentMention.query.toLowerCase();
    return agents.filter(agent => 
      agent.name.toLowerCase().includes(query)
    );
  }, [agents, currentMention]);

  // Check for @ mentions and update state
  const checkForMention = (text: string, cursor: number) => {
    // Find the last @ before the cursor
    const beforeCursor = text.substring(0, cursor);
    const lastAtIndex = beforeCursor.lastIndexOf('@');
    
    if (lastAtIndex === -1) {
      setCurrentMention(null);
      setShowAgentDropdown(false);
      return;
    }

    // Get text after @ up to cursor
    const textAfterAt = beforeCursor.substring(lastAtIndex + 1);
    
    // Check if we have a completed agent mention (agent name + space + more content)
    // This catches cases like "@agentname hello world"
    const hasCompletedMention = agents.some(agent => {
      const agentName = agent.name.toLowerCase();
      const textLower = textAfterAt.toLowerCase();
      
      // If the text starts with agent name followed by space, the mention is complete
      if (textLower.startsWith(agentName + " ")) {
        return true;
      }
      
      return false;
    });
    
    if (hasCompletedMention) {
      setCurrentMention(null);
      setShowAgentDropdown(false);
      return;
    }
    
    // Check for exact agent name match (without additional content)
    const hasExactAgentMatch = agents.some(agent => 
      textAfterAt.toLowerCase() === agent.name.toLowerCase()
    );
    
    // If exact match and we're at end or next char is space, hide dropdown
    if (hasExactAgentMatch && (cursor >= text.length || /\s/.test(text[cursor]))) {
      setCurrentMention(null);
      setShowAgentDropdown(false);
      return;
    }
    
    // Check if we just typed a space after a valid agent name
    if (textAfterAt.endsWith(' ')) {
      const agentNamePart = textAfterAt.slice(0, -1);
      const isValidAgent = agents.some(agent => 
        agent.name.toLowerCase() === agentNamePart.toLowerCase()
      );
      
      if (isValidAgent) {
        setCurrentMention(null);
        setShowAgentDropdown(false);
        return;
      }
    }

    // Check if textAfterAt contains spaces (indicating we're past the agent name)
    if (textAfterAt.includes(' ')) {
      // Check if the part before the first space is a valid agent
      const beforeSpace = textAfterAt.split(' ')[0];
      const isValidAgent = agents.some(agent => 
        agent.name.toLowerCase() === beforeSpace.toLowerCase()
      );
      
      if (isValidAgent) {
        // Valid agent found, hide dropdown since mention is complete
        setCurrentMention(null);
        setShowAgentDropdown(false);
        return;
      }
    }

    // We have an active mention - show dropdown
    setCurrentMention({
      startIndex: lastAtIndex,
      query: textAfterAt
    });
    setShowAgentDropdown(true);
    setSelectedIndex(0);
  };

  // Handle input changes
  const handleInputChange = (value: string, cursor: number) => {
    setInputValue(value);
    setCursorPosition(cursor);
    checkForMention(value, cursor);
  };

  // Select an agent
  const handleSelectAgent = (agent: Agent, textAreaRef?: React.RefObject<any>) => {
    if (!currentMention) return inputValue;

    const beforeMention = inputValue.substring(0, currentMention.startIndex);
    const afterMention = inputValue.substring(cursorPosition);
    const newValue = `${beforeMention}@${agent.name} ${afterMention}`;
    
    setInputValue(newValue);
    setCurrentMention(null);
    setShowAgentDropdown(false);
    
    // Set cursor position after the mention
    setTimeout(() => {
      if (textAreaRef?.current) {
        const element = textAreaRef.current;
        const newCursorPos = currentMention.startIndex + agent.name.length + 2; // +2 for @ and space
        
        // Check if the element has setSelectionRange method (input/textarea)
        if (typeof element.setSelectionRange === 'function') {
          element.setSelectionRange(newCursorPos, newCursorPos);
        } else if (element.input && typeof element.input.setSelectionRange === 'function') {
          // For Ant Design Input components, try accessing the underlying input
          element.input.setSelectionRange(newCursorPos, newCursorPos);
        }
        
        // Focus the element
        if (typeof element.focus === 'function') {
          element.focus();
        } else if (element.input && typeof element.input.focus === 'function') {
          element.input.focus();
        }
      }
    }, 0);

    return newValue;
  };

  // Parse agent mentions from text
  const parseAgentMentions = (text: string): AgentMention[] => {
    const mentions: AgentMention[] = [];
    
    // Try to find mentions for each agent by name
    agents.forEach(agent => {
      const mentionPattern = `@${agent.name}`;
      let startIndex = 0;
      
      while ((startIndex = text.indexOf(mentionPattern, startIndex)) !== -1) {
        // Check if this is a word boundary (not part of a larger word)
        const endIndex = startIndex + mentionPattern.length;
        const charAfter = text[endIndex];
        
        // Only match if followed by whitespace, punctuation, or end of string
        if (!charAfter || /\s|[.,!?;]/.test(charAfter)) {
          mentions.push({
            id: agent.id,
            name: agent.name,
            startIndex: startIndex,
            endIndex: endIndex
          });
        }
        
        startIndex = endIndex;
      }
    });

    // Sort mentions by start index
    return mentions.sort((a, b) => a.startIndex - b.startIndex);
  };

  // Get mentioned agent from text (single agent - for backward compatibility)
  const getMentionedAgent = (text: string): Agent | null => {
    console.log("🔍 [AGENT_MENTION] Parsing text:", text);
    console.log("🔍 [AGENT_MENTION] Available agents:", agents.map(a => ({ id: a.id, name: a.name })));
    
    const mentions = parseAgentMentions(text);
    console.log("🔍 [AGENT_MENTION] Found mentions:", mentions);
    
    if (mentions.length > 0) {
      const firstMention = mentions[0];
      const foundAgent = agents.find(agent => agent.id === firstMention.id);
      console.log("🔍 [AGENT_MENTION] Resolved agent:", foundAgent);
      return foundAgent || null;
    }
    console.log("🔍 [AGENT_MENTION] No mentions found");
    return null;
  };

  // Get all mentioned agents from text (multi-agent support)
  const getMentionedAgents = (text: string): Agent[] => {
    console.log("🔍 [MULTI_AGENT] Parsing text for all agents:", text);
    console.log("🔍 [MULTI_AGENT] Available agents:", agents.map(a => ({ id: a.id, name: a.name })));
    
    const mentions = parseAgentMentions(text);
    console.log("🔍 [MULTI_AGENT] Found mentions:", mentions);
    
    const foundAgents = mentions
      .map(mention => agents.find(agent => agent.id === mention.id))
      .filter((agent): agent is Agent => agent !== undefined);
    
    console.log("🔍 [MULTI_AGENT] Resolved agents:", foundAgents.map(a => ({ id: a.id, name: a.name })));
    return foundAgents;
  };

  // Handle keyboard navigation
  const handleKeyDown = (e: React.KeyboardEvent, onSend: () => void) => {
    if (showAgentDropdown && filteredAgents.length > 0) {
      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault();
          setSelectedIndex(prev => 
            prev < filteredAgents.length - 1 ? prev + 1 : 0
          );
          return { preventDefault: true };
          
        case 'ArrowUp':
          e.preventDefault();
          setSelectedIndex(prev => 
            prev > 0 ? prev - 1 : filteredAgents.length - 1
          );
          return { preventDefault: true };
          
        case 'Enter':
        case 'Tab':
          e.preventDefault();
          return { 
            preventDefault: true,
            selectAgentAtIndex: selectedIndex 
          };
          
        case 'Escape':
          setShowAgentDropdown(false);
          setCurrentMention(null);
          return { preventDefault: true };
      }
    }

    // Regular enter key handling
    if (e.key === 'Enter' && !e.shiftKey && !showAgentDropdown) {
      e.preventDefault();
      onSend();
      return { preventDefault: true };
    }

    return { preventDefault: false };
  };

  // Clear state
  const clearState = () => {
    setInputValue("");
    setCurrentMention(null);
    setShowAgentDropdown(false);
    setCursorPosition(0);
    setSelectedIndex(0);
  };

  return {
    inputValue,
    setInputValue,
    filteredAgents,
    showAgentDropdown,
    selectedIndex,
    handleInputChange,
    handleSelectAgent,
    parseAgentMentions,
    getMentionedAgent,
    getMentionedAgents, // New multi-agent function
    handleKeyDown,
    clearState
  };
};