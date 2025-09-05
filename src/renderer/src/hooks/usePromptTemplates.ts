import { useState, useEffect, useCallback } from "react";

export const usePromptTemplates = () => {
  const [promptTemplates, setPromptTemplates] = useState<any[]>([]);
  const [filteredTemplates, setFilteredTemplates] = useState<any[]>([]);
  const [selectedPromptChips, setSelectedPromptChips] = useState<any[]>([]);
  const [showPromptDropdown, setShowPromptDropdown] = useState(false);
  const [cursorPosition, setCursorPosition] = useState(0);
  const [selectedIndex, setSelectedIndex] = useState(0);

  // Load prompt templates on mount
  useEffect(() => {
    const loadPromptTemplates = async () => {
      try {
        const templates = await window.api.storage.getPromptTemplates();
        setPromptTemplates(templates || []);
      } catch (error) {
        console.error("Failed to load prompt templates:", error);
      }
    };
    loadPromptTemplates();
  }, []);

  const handleInputChange = useCallback(
    (value: string, cursor: number) => {
      setCursorPosition(cursor);

      // Check for slash commands with short keys
      const beforeCursor = value.slice(0, cursor);
      const slashMatch = beforeCursor.match(/\/(\w*)$/);

      if (slashMatch) {
        const shortKey = slashMatch[1] || "";

        // Find templates that match the shortKey or show all if empty shortKey
        const filtered = promptTemplates.filter((template) => {
          if (!shortKey) {
            return template.shortKey; // Only show templates that have shortKeys when typing just '/'
          }
          return (
            template.shortKey &&
            template.shortKey.toLowerCase().startsWith(shortKey.toLowerCase())
          );
        });

        setFilteredTemplates(filtered);
        setShowPromptDropdown(filtered.length > 0);
        setSelectedIndex(0); // Reset selection when filtering
      } else {
        setShowPromptDropdown(false);
        setFilteredTemplates([]);
        setSelectedIndex(0);
      }
    },
    [promptTemplates]
  );

  const handleSelectTemplate = useCallback(
    (template: any, inputValue: string, textAreaRef: React.RefObject<any>) => {
      const beforeCursor = inputValue.slice(0, cursorPosition);
      const afterCursor = inputValue.slice(cursorPosition);

      // Find the slash command trigger position and remove it
      const match = beforeCursor.match(/\/\w*$/);
      if (match) {
        const triggerStart = beforeCursor.lastIndexOf(match[0]);
        const newValue = beforeCursor.slice(0, triggerStart) + afterCursor;

        // Add template as chip
        setSelectedPromptChips((prev) => [...prev, template]);

        // Set cursor position where the trigger was
        setTimeout(() => {
          if (textAreaRef.current) {
            textAreaRef.current.setSelectionRange(triggerStart, triggerStart);
            textAreaRef.current.focus();
          }
        }, 0);

        setShowPromptDropdown(false);
        setFilteredTemplates([]);

        return newValue;
      }

      return inputValue;
    },
    [cursorPosition]
  );

  const handleRemoveChip = useCallback((templateId: string) => {
    setSelectedPromptChips((prev) =>
      prev.filter((chip) => chip.id !== templateId)
    );
  }, []);

  const buildMessageContent = useCallback(
    (inputText: string) => {
      let messageContent = inputText.trim();
      if (selectedPromptChips.length > 0) {
        const promptContents = selectedPromptChips
          .map((chip) => chip.content)
          .join("\n\n");
        messageContent = messageContent
          ? `${messageContent}\n\n${promptContents}`
          : promptContents;
      }
      return messageContent;
    },
    [selectedPromptChips]
  );

  const clearChips = useCallback(() => {
    setSelectedPromptChips([]);
  }, []);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent, onSend: () => void) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        if (showPromptDropdown) {
          // If dropdown is open, select the currently highlighted template
          if (filteredTemplates.length > 0) {
            return { selectTemplateAtIndex: selectedIndex };
          } else {
            setShowPromptDropdown(false);
          }
        } else {
          onSend();
        }
        return undefined;
      } else if (e.key === "Escape" && showPromptDropdown) {
        e.preventDefault();
        setShowPromptDropdown(false);
        setSelectedIndex(0);
        return undefined;
      } else if (e.key === "ArrowDown" && showPromptDropdown) {
        e.preventDefault();
        if (filteredTemplates.length > 0) {
          setSelectedIndex((prev) => (prev + 1) % filteredTemplates.length);
        }
        return undefined;
      } else if (e.key === "ArrowUp" && showPromptDropdown) {
        e.preventDefault();
        if (filteredTemplates.length > 0) {
          setSelectedIndex((prev) => (prev - 1 + filteredTemplates.length) % filteredTemplates.length);
        }
        return undefined;
      }
      return undefined;
    },
    [showPromptDropdown, filteredTemplates, selectedIndex]
  );

  return {
    promptTemplates,
    filteredTemplates,
    selectedPromptChips,
    showPromptDropdown,
    cursorPosition,
    selectedIndex,
    handleInputChange,
    handleSelectTemplate,
    handleRemoveChip,
    buildMessageContent,
    clearChips,
    handleKeyDown,
    setShowPromptDropdown,
  };
};