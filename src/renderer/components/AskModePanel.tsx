import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useAutoAnimate } from '@formkit/auto-animate/react';
import { ChatMessage } from './ChatMessage';
import { useOpenCodeContext } from '../context/OpenCodeProvider';
import { useSessionHistory } from '../storage';
import { useOpenCode } from '../hooks/useOpenCode';
import type { ChatMessage as ChatMessageType, MCPServer } from '../data/mockAskData';

interface AskModePanelProps {
  initialQuery?: string;
}

const mockSuggestions = [
  'Optimize Electron cold start time',
  'How to use React 19 use() hook?',
  'Add authentication to the app',
  'Explain context isolation in Electron',
];

export function AskModePanel({ initialQuery = '' }: AskModePanelProps) {
  const { state: openCodeState, dispatch } = useOpenCodeContext();
  const {
    sessions: sessionHistory,
    isLoading: isLoadingHistory,
    createSession: createDbSession,
    loadSession: loadDbSession,
    saveSession,
    addMessage,
    refresh: refreshHistory,
  } = useSessionHistory();
  const { streamMessage } = useOpenCode();

  const [sessions, setSessions] = useState<Array<{
    id: string;
    title: string;
    createdAt: string;
    updatedAt: string;
    messageCount: number;
  }>>([]);
  const [currentSession, setCurrentSession] = useState<{
    id: string;
    title: string;
    messages: ChatMessageType[];
    mcpServers: MCPServer[];
  } | null>(null);
  const [sessionsDropdownOpen, setSessionsDropdownOpen] = useState(false);
  const [modelSelectorOpen, setModelSelectorOpen] = useState(false);
  const [inputValue, setInputValue] = useState(initialQuery);
  const [isSending, setIsSending] = useState(false);
  const [animationRef] = useAutoAnimate({
    duration: 200,
    easing: 'ease-in-out',
  });

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const modelDropdownRef = useRef<HTMLDivElement>(null);

  // Convert MCP servers from context to component format
  const mcpServers: MCPServer[] = openCodeState.mcpServers.map((server) => ({
    id: server.id,
    name: server.name,
    status: server.status as 'connected' | 'disconnected' | 'connecting',
    icon: server.icon,
  }));

  // Scroll to bottom when messages change
  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [currentSession?.messages, scrollToBottom]);

  // Set initial query
  useEffect(() => {
    setInputValue(initialQuery);
  }, [initialQuery]);

  // Load session history
  useEffect(() => {
    refreshHistory().then((loadedSessions) => {
      setSessions(loadedSessions || []);
    }).catch(console.error);
  }, []);

  // Load last session or create new one
  useEffect(() => {
    const initSession = async () => {
      if (sessions.length > 0) {
        // Load most recent session
        const session = await loadDbSession(sessions[0].id);
        if (session) {
          setCurrentSession({
            id: session.id,
            title: session.title,
            messages: session.messages.map((msg) => ({
              ...msg,
              timestamp: new Date(msg.timestamp),
            })),
            mcpServers: mcpServers,
          });
        }
      } else {
        // Create new session
        handleNewChat();
      }
    };

    if (!currentSession && mcpServers.length > 0) {
      initSession();
    }
  }, [sessions, mcpServers]);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setSessionsDropdownOpen(false);
      }
      if (modelDropdownRef.current && !modelDropdownRef.current.contains(event.target as Node)) {
        setModelSelectorOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleNewChat = async () => {
    const session = await createDbSession('New Chat');
    setCurrentSession({
      id: session.id,
      title: session.title,
      messages: [],
      mcpServers: mcpServers,
    });
    setSessionsDropdownOpen(false);
    inputRef.current?.focus();
    refreshHistory();
  };

  const handleSessionSelect = async (sessionId: string) => {
    const session = await loadDbSession(sessionId);
    if (session) {
      setCurrentSession({
        id: session.id,
        title: session.title,
        messages: session.messages.map((msg) => ({
          ...msg,
          timestamp: new Date(msg.timestamp),
        })),
        mcpServers: mcpServers,
      });
    }
    setSessionsDropdownOpen(false);
  };

  const handleSendMessage = async () => {
    if (!inputValue.trim() || isSending || !currentSession) return;

    const userMessage: ChatMessageType = {
      id: `msg-${Date.now()}-user`,
      role: 'user',
      content: inputValue.trim(),
      timestamp: new Date(),
    };

    // Update UI immediately
    setCurrentSession((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        messages: [...prev.messages, userMessage],
        title: prev.messages.length === 0 ? inputValue.trim().slice(0, 50) : prev.title,
      };
    });

    // Create assistant message placeholder for streaming
    const messageId = `msg-${Date.now()}-assistant`;
    const assistantMessage: ChatMessageType = {
      id: messageId,
      role: 'assistant',
      content: '',
      timestamp: new Date(),
      isStreaming: true,
    };

    setCurrentSession((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        messages: [...prev.messages, assistantMessage],
      };
    });

    setInputValue('');
    setIsSending(true);

    // Save user message to IndexedDB
    await addMessage(currentSession.id, {
      id: userMessage.id,
      role: userMessage.role,
      content: userMessage.content,
      timestamp: userMessage.timestamp.toISOString(),
    });

    // Get all messages for context
    const allMessages = [...currentSession.messages.map((m) => ({
      role: m.role,
      content: m.content,
    })), { role: 'user', content: userMessage.content }];

    try {
      // Use the streamMessage method
      const responseText = await streamMessage(
        currentSession.id,
        allMessages,
        (chunk) => {
          // Update message content as chunks arrive
          setCurrentSession((prev) => {
            if (!prev) return prev;
            return {
              ...prev,
              messages: prev.messages.map((msg) =>
                msg.id === messageId
                  ? { ...msg, content: msg.content + chunk }
                  : msg
              ),
            };
          });
        },
        openCodeState.selectedModel?.id
      );

      // Mark message as complete
      setCurrentSession((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          messages: prev.messages.map((msg) =>
            msg.id === messageId
              ? { ...msg, isStreaming: false }
              : msg
          ),
        };
      });

      // Save assistant message to IndexedDB
      await addMessage(currentSession.id, {
        id: messageId,
        role: 'assistant',
        content: responseText,
        timestamp: new Date().toISOString(),
      });

      setIsSending(false);
    } catch (err) {
      console.error('[AskModePanel] Send message error:', err);
      setCurrentSession((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          messages: prev.messages.map((msg) =>
            msg.id === messageId
              ? { ...msg, content: `Error: ${err instanceof Error ? err.message : 'Failed to send message'}`, isStreaming: false }
              : msg
          ),
        };
      });
      setIsSending(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const handleSuggestionClick = (suggestion: string) => {
    setInputValue(suggestion);
    inputRef.current?.focus();
  };

  const handleClearSession = async () => {
    if (!currentSession) return;
    setCurrentSession({ ...currentSession, messages: [] });
    // Save cleared session
    await saveSession({
      id: currentSession.id,
      title: currentSession.title,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      messages: [],
      mcpServers: currentSession.mcpServers.map((s) => s.id),
    });
    refreshHistory();
  };

  const hasMessages = currentSession?.messages.length ? currentSession.messages.length > 0 : false;

  return (
    <div className="chat-panel">
      {/* Header */}
      <div className="chat-panel-header">
        <div className="chat-panel-header-left">
          {/* Session Dropdown */}
          <div className="session-dropdown" ref={dropdownRef}>
            <button
              className="chat-panel-sessions"
              onClick={() => setSessionsDropdownOpen(!sessionsDropdownOpen)}
            >
              <span className="sessions-icon">💬</span>
              <span className="sessions-text">{currentSession?.title || 'New Chat'}</span>
              <svg
                width="12"
                height="12"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <path d="M6 9L12 15L18 9" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>

            {sessionsDropdownOpen && (
              <div className="session-dropdown-content">
                <div className="session-dropdown-header">
                  <span>Recent Chats</span>
                  <button className="session-close" onClick={() => setSessionsDropdownOpen(false)}>
                    ×
                  </button>
                </div>
                <div className="session-list">
                  {sessions.map((session) => (
                    <button
                      key={session.id}
                      className={`session-item ${currentSession?.id === session.id ? 'active' : ''}`}
                      onClick={() => handleSessionSelect(session.id)}
                    >
                      <div className="session-item-title">{session.title}</div>
                      <div className="session-item-meta">
                        {session.messageCount} messages
                      </div>
                    </button>
                  ))}
                  <button
                    className="session-item"
                    onClick={handleNewChat}
                    style={{ borderTop: '1px solid var(--kraken-border)', marginTop: '4px' }}
                  >
                    <div className="session-item-title" style={{ color: 'var(--kraken-purple)' }}>
                      + New Chat
                    </div>
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="chat-panel-actions">
          {/* Model Selector */}
          <div className="ask-mode-model-selector" ref={modelDropdownRef}>
            <button
              className="ask-mode-model-toggle"
              onClick={(e) => {
                e.stopPropagation();
                setModelSelectorOpen(!modelSelectorOpen);
              }}
            >
              <svg className="ask-mode-model-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="9"/>
                <path d="M12 8v8M8 12h8" strokeLinecap="round"/>
              </svg>
              <span className="ask-mode-model-name">{openCodeState.selectedModel?.name || 'Select Model'}</span>
              <svg className="ask-mode-model-dropdown-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M6 9L12 15L18 9" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </button>

            {modelSelectorOpen && (
              <div className="ask-mode-model-dropdown-menu">
                {openCodeState.models.map((model) => (
                  <div
                    key={model.id}
                    className={`ask-mode-model-dropdown-item ${openCodeState.selectedModel?.id === model.id ? 'active' : ''}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      dispatch({ type: 'SET_SELECTED_MODEL', payload: model });
                      setModelSelectorOpen(false);
                    }}
                  >
                    <div className="ask-mode-model-dropdown-item-content">
                      <span className="ask-mode-model-dropdown-item-label">{model.name}</span>
                      {model.description && (
                        <span className="ask-mode-model-dropdown-item-desc">{model.description}</span>
                      )}
                    </div>
                    {model.isRecommended && (
                      <span className="ask-mode-model-dropdown-item-badge">Recommended</span>
                    )}
                    {openCodeState.selectedModel?.id === model.id && (
                      <svg className="ask-mode-model-dropdown-item-check" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M20 6L9 17L4 12" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* New Session Button */}
          <button className="chat-panel-new-session" onClick={handleNewChat}>
            <span className="new-session-icon">+</span>
            <span className="new-session-text">New Chat</span>
          </button>

          {/* Clear Button */}
          <button
            className="chat-panel-clear"
            onClick={handleClearSession}
            disabled={!hasMessages}
          >
            Clear
          </button>
        </div>
      </div>

      {/* MCP Server Status */}
      <div className="mcp-server-status">
        <span className="mcp-status-label">MCP Servers:</span>
        <div className="mcp-server-list">
          {mcpServers.map((server: MCPServer) => (
            <div
              key={server.id}
              className={`mcp-server-badge ${server.status}`}
            >
              <span className="mcp-server-dot" />
              <span>{server.icon}</span>
              <span>{server.name}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Messages */}
      <div className="chat-messages" ref={animationRef}>
        {!hasMessages ? (
          <div className="chat-empty-state">
            <div className="chat-empty-icon">🧠</div>
            <h4>How can I help you today?</h4>
            <p>Ask me anything about your codebase, or try a suggestion below.</p>
            <div className="chat-suggestions">
              {mockSuggestions.map((suggestion, index) => (
                <button
                  key={index}
                  className="chat-suggestion"
                  onClick={() => handleSuggestionClick(suggestion)}
                >
                  {suggestion}
                </button>
              ))}
            </div>
          </div>
        ) : (
          currentSession?.messages.map((message) => (
            <ChatMessage key={message.id} message={message} />
          ))
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input Form */}
      <form
        className="chat-input-form"
        onSubmit={(e) => {
          e.preventDefault();
          handleSendMessage();
        }}
      >
        <div className="chat-input-wrapper">
          <textarea
            ref={inputRef}
            className="chat-input"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask anything..."
            rows={1}
            disabled={isSending}
          />
          <button
            type="submit"
            className="chat-send-button"
            disabled={!inputValue.trim() || isSending}
          >
            {isSending ? (
              <span className="typing-indicator">
                <span></span>
                <span></span>
                <span></span>
              </span>
            ) : (
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M22 2L11 13M22 2L15 22L11 13M22 2L2 9L11 13" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            )}
          </button>
        </div>
      </form>
    </div>
  );
}