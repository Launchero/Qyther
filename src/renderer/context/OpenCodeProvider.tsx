import React, { createContext, useContext, useReducer, ReactNode, useEffect, useCallback } from 'react';
import { useOpenCode } from '../hooks/useOpenCode';

/**
 * MCP Server type
 */
export interface MCPServerInfo {
  id: string;
  name: string;
  status: string;
  icon: string;
}

/**
 * AI Model type
 */
export interface AIModelInfo {
  id: string;
  name: string;
  description?: string;
  isRecommended?: boolean;
}

/**
 * OpenCode Context State
 */
interface State {
  sessionId: string | null;
  messages: any[];
  isProcessing: boolean;
  /** @deprecated - streaming removed */
  isStreaming: boolean;
  mcpServers: MCPServerInfo[];
  models: AIModelInfo[];
  selectedModel: AIModelInfo | null;
}

/**
 * OpenCode Context Actions
 */
type Action =
  | { type: 'SET_SESSION'; payload: string }
  | { type: 'ADD_MESSAGE'; payload: any }
  | { type: 'UPDATE_MESSAGE'; payload: { id: string; updates: any } }
  | { type: 'SET_MESSAGES'; payload: any[] }
  | { type: 'CLEAR_SESSION' }
  | { type: 'SET_PROCESSING'; payload: boolean }
  | { type: 'SET_STREAMING'; payload: boolean } // @deprecated - streaming removed
  | { type: 'SET_MCP_SERVERS'; payload: MCPServerInfo[] }
  | { type: 'SET_MODELS'; payload: AIModelInfo[] }
  | { type: 'SET_SELECTED_MODEL'; payload: AIModelInfo | null };

/**
 * OpenCode Context Type
 */
interface OpenCodeContextType {
  state: State;
  dispatch: React.Dispatch<Action>;
  api: ReturnType<typeof useOpenCode>;
}

const OpenCodeContext = createContext<OpenCodeContextType | null>(null);

/**
 * Session reducer
 */
function sessionReducer(state: State, action: Action): State {
  switch (action.type) {
    case 'SET_SESSION':
      return { ...state, sessionId: action.payload };

    case 'ADD_MESSAGE':
      return { ...state, messages: [...state.messages, action.payload] };

    case 'UPDATE_MESSAGE':
      return {
        ...state,
        messages: state.messages.map(msg =>
          msg.id === action.payload.id
            ? { ...msg, ...action.payload.updates }
            : msg
        ),
      };

    case 'SET_MESSAGES':
      return { ...state, messages: action.payload };

    case 'CLEAR_SESSION':
      return { ...state, sessionId: null, messages: [] };

    case 'SET_PROCESSING':
      return { ...state, isProcessing: action.payload };

    case 'SET_STREAMING':
      return { ...state, isStreaming: action.payload };

    case 'SET_MCP_SERVERS':
      return { ...state, mcpServers: action.payload };

    case 'SET_MODELS':
      return { ...state, models: action.payload };

    case 'SET_SELECTED_MODEL':
      return { ...state, selectedModel: action.payload };

    default:
      return state;
  }
}

/**
 * OpenCode Provider Component
 * Wraps the app with OpenCode context and API
 */
export function OpenCodeProvider({ children }: { children: ReactNode }) {
  const api = useOpenCode();

  const [state, dispatch] = useReducer(sessionReducer, {
    sessionId: null,
    messages: [],
    isProcessing: false,
    isStreaming: false,
    mcpServers: [],
    models: [],
    selectedModel: null,
  });

  // Load MCP servers and models on mount (only once)
  useEffect(() => {
    let isMounted = true;
    const loadInitialData = async () => {
      try {
        // Load MCP servers
        const servers = await api.getMCPServers();
        if (isMounted) {
          dispatch({ type: 'SET_MCP_SERVERS', payload: servers });
        }

        // Load models
        const models = await api.getModels();
        if (isMounted) {
          dispatch({ type: 'SET_MODELS', payload: models });

          // Set default model (first recommended or first available)
          const recommended = models.find((m: AIModelInfo) => m.isRecommended);
          if (recommended) {
            dispatch({ type: 'SET_SELECTED_MODEL', payload: recommended });
          } else if (models.length > 0) {
            dispatch({ type: 'SET_SELECTED_MODEL', payload: models[0] });
          }
        }
      } catch (err) {
        console.error('[OpenCodeProvider] Failed to load initial data:', err);
      }
    };

    loadInitialData();

    return () => {
      isMounted = false;
    };
  }, []); // Empty dependency array - only run once on mount

  return (
    <OpenCodeContext.Provider value={{ state, dispatch, api }}>
      {children}
    </OpenCodeContext.Provider>
  );
}

/**
 * Hook to use OpenCode context
 */
export function useOpenCodeContext(): OpenCodeContextType {
  const context = useContext(OpenCodeContext);
  
  if (!context) {
    throw new Error('useOpenCodeContext must be used within OpenCodeProvider');
  }
  
  return context;
}

/**
 * Hook to check if OpenCode is initialized
 */
export function useOpenCodeInitialized(): boolean {
  const context = useContext(OpenCodeContext);
  return context?.api.isInitialized ?? false;
}
