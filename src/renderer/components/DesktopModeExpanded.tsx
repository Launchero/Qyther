import React, { useState, useEffect, useReducer, useCallback, useRef } from 'react';
import { DesktopProgressPanel, DesktopProgress, DesktopErrorInfo } from './common/DesktopProgressPanel';
import { DesktopWelcomeState } from './common/DesktopWelcomeState';
import { DesktopConfirmationDialog } from './common/DesktopConfirmationDialog';
import {
  desktopControlReducer,
  initialDesktopState,
  DesktopAction,
  DesktopSession,
} from '../hooks/useDesktopControl';

interface DesktopUIPayload {
  id: string;
  type: string;
  description: string;
  success: boolean;
  result?: unknown;
}

export interface DesktopModeExpandedProps {
  searchQuery: string;
  onSearchChange: (query: string) => void;
  onRegisterSendMessage?: ((fn: ((message?: string) => void) | null) => void);
}

interface DesktopCommandEntry {
  id: string;
  query: string;
  response: string;
  actions: DesktopAction[];
  timestamp: number;
}

export function DesktopModeExpanded({
  searchQuery,
  onSearchChange,
  onRegisterSendMessage,
}: DesktopModeExpandedProps) {
  const [desktopState, dispatch] = useReducer(desktopControlReducer, initialDesktopState);
  const [welcomeState, setWelcomeState] = useState(true);
  const [errorInfo, setErrorInfo] = useState<DesktopErrorInfo | null>(null);
  const [commandHistory, setCommandHistory] = useState<DesktopCommandEntry[]>([]);
  const [streamedResponse, setStreamedResponse] = useState('');
  const [streamConfidence, setStreamConfidence] = useState<number | undefined>(undefined);
  const [pendingConfirmQuery, setPendingConfirmQuery] = useState<string | null>(null);
  const [confirmationOpen, setConfirmationOpen] = useState(false);
  const [pendingConfirmAction, setPendingConfirmAction] = useState<DesktopAction | null>(null);
  const lastQueryRef = useRef<string>('');
  const succeededActionsRef = useRef<DesktopAction[]>([]);

  // Chat IPC event listeners for LangGraph integration
  useEffect(() => {
    const handleStreamChunk = (data: {
      chunk: string; isComplete: boolean; metrics?: unknown;
      thinkingSteps?: unknown[]; confidence?: number; uiPayloads?: unknown[];
    }) => {
      if (!data.isComplete && data.chunk) {
        setStreamedResponse(prev => prev + data.chunk);
      }
      if (data.confidence !== undefined) {
        setStreamConfidence(Math.round(data.confidence * 100));
      }
      if (data.isComplete) {
        // Check if this is a confirmation request (not a true error)
        const isConfirmation = streamedResponse.includes('Please confirm') || streamedResponse.includes('destructive action');

        if (isConfirmation && !pendingConfirmQuery) {
          // Extract the planned action for the confirmation dialog
          const pendingAction: DesktopAction = {
            id: `pending-${Date.now()}`,
            type: 'windowAction',
            description: streamedResponse.replace(/Please confirm.*$/, '').trim() || 'Destructive desktop action',
            timestamp: new Date(),
            success: false,
            reversible: true,
          };
          setPendingConfirmAction(pendingAction);
          setConfirmationOpen(true);
          dispatch({ type: 'SET_SESSION_ACTIVE', active: false });
          return;
        }

        if (streamedResponse || data.uiPayloads) {
          const entry: DesktopCommandEntry = {
            id: `cmd-${Date.now()}`,
            query: lastQueryRef.current,
            response: streamedResponse,
            actions: [...succeededActionsRef.current],
            timestamp: Date.now(),
          };
          setCommandHistory(prev => [...prev, entry]);

          // Handle desktop-specific UI payloads
          if (data.uiPayloads && Array.isArray(data.uiPayloads)) {
            for (const payload of data.uiPayloads as DesktopUIPayload[]) {
              dispatch({
                type: 'ADD_ACTION',
                action: {
                  id: payload.id || `action-${Date.now()}`,
                  type: payload.type as DesktopAction['type'],
                  description: payload.description || 'Desktop action completed',
                  timestamp: new Date(),
                  success: payload.success,
                  result: payload.result,
                  reversible: false,
                },
              });
            }
          }

          // Save session to history
          const session: DesktopSession = {
            id: entry.id,
            title: lastQueryRef.current.length > 40 ? lastQueryRef.current.slice(0, 40) + '...' : lastQueryRef.current,
            lastQuery: lastQueryRef.current,
            responseCount: 1,
            createdAt: entry.timestamp,
            durationMs: desktopState.elapsedMs,
          };
          dispatch({ type: 'ADD_SESSION', session });
        }

        succeededActionsRef.current = [];
        dispatch({ type: 'SET_SESSION_ACTIVE', active: false });
      }
    };

    const handleThinkingStep = (data: {
      type: string; step: string; status: string; detail: string;
      data?: unknown; update?: boolean;
    }) => {
      if (data.status === 'in_progress') {
        dispatch({
          type: 'SET_PROGRESS',
          progress: {
            step: 1,
            maxSteps: 1,
            status: 'in_progress' as DesktopProgress['status'],
            message: data.detail,
            actionType: 'desktop',
          },
        });
      } else if (data.status === 'completed') {
        dispatch({
          type: 'SET_PROGRESS',
          progress: {
            step: 1,
            maxSteps: 1,
            status: 'completed' as DesktopProgress['status'],
            message: data.detail,
            actionType: 'desktop',
          },
        });
      }
    };

    const handleProgress = (data: {
      actionType: string; step: number; totalSteps: number; message: string; status: string;
    }) => {
      const mappedStatus = ((): DesktopProgress['status'] => {
        if (data.status === 'error') return 'error';
        if (data.status === 'completed') return 'complete';
        return 'in_progress';
      })();

      dispatch({
        type: 'SET_PROGRESS',
        progress: {
          step: data.step,
          maxSteps: data.totalSteps,
          status: mappedStatus,
          message: data.message,
          actionType: data.actionType,
        },
      });

      if (data.status === 'completed') {
        const action: DesktopAction = {
          id: `action-${Date.now()}`,
          type: data.actionType as DesktopAction['type'],
          description: data.message,
          timestamp: new Date(),
          success: true,
          reversible: false,
        };
        dispatch({ type: 'ADD_ACTION', action });
        succeededActionsRef.current = [...succeededActionsRef.current, action];
      }
    };

    const handleError = (data: { actionType: string; error: string; partial?: unknown }) => {
      setErrorInfo({
        message: data.error,
        succeededActions: succeededActionsRef.current.map(a => ({ description: a.description })),
        failedAction: {
          description: `Action: ${data.actionType}`,
          error: data.error,
        },
        suggestions: getSuggestionsForError(data.actionType),
        elapsedMs: desktopState.elapsedMs,
      });
      dispatch({ type: 'SET_SESSION_ACTIVE', active: false });
    };

    const cleanupChat = window.electronAPI.chat.onStreamChunk(handleStreamChunk);
    const cleanupThinking = window.electronAPI.chat.onThinkingStep(handleThinkingStep);
    const cleanupProgress = window.electronAPI.desktop.onProgress(handleProgress);
    const cleanupError = window.electronAPI.desktop.onError(handleError);

    return () => {
      cleanupChat();
      cleanupThinking();
      cleanupProgress();
      cleanupError();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [streamedResponse, desktopState.elapsedMs]);

  function getSuggestionsForError(actionType: string): string[] {
    const suggestions: string[] = [];
    switch (actionType) {
      case 'typeText':
        suggestions.push('Check if the target window is open');
        suggestions.push('Try listing windows first to verify the name');
        break;
      case 'openApp':
        suggestions.push('Check if the application is installed');
        suggestions.push('Try using the full application name');
        break;
      case 'click':
        suggestions.push('Take a screenshot first to find the correct coordinates');
        break;
      case 'focusWindow':
      case 'closeWindow':
      case 'minimizeWindow':
      case 'maximizeWindow':
        suggestions.push('List windows first to verify the window title');
        break;
      default:
        suggestions.push('Try a simpler command first');
    }
    return suggestions;
  }

  // Timer for elapsed time
  useEffect(() => {
    if (desktopState.sessionActive && desktopState.startTime && !desktopState.isPaused) {
      const timer = setInterval(() => {
        dispatch({ type: 'SET_ELAPSED', elapsedMs: Date.now() - desktopState.startTime! });
      }, 100);
      return () => clearInterval(timer);
    }
  }, [desktopState.sessionActive, desktopState.startTime, desktopState.isPaused]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && confirmationOpen) {
        e.preventDefault();
        setConfirmationOpen(false);
        setPendingConfirmQuery(null);
        setPendingConfirmAction(null);
        dispatch({ type: 'SET_SESSION_ACTIVE', active: false });
      }
      const metaOrCtrl = e.metaKey || e.ctrlKey;
      if (metaOrCtrl && e.shiftKey && e.key === 'D') {
        e.preventDefault();
        dispatch({ type: 'TOGGLE_MODE', enabled: !desktopState.enabled });
      }
      if (metaOrCtrl && e.shiftKey && e.key === 'X') {
        e.preventDefault();
        dispatch({ type: 'RESET' });
        setErrorInfo(null);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [desktopState.enabled, confirmationOpen]);

  const searchQueryRef = useRef(searchQuery);
  searchQueryRef.current = searchQuery;

  useEffect(() => {
    onRegisterSendMessage?.((message) => {
      const queryToSend = message?.trim() || searchQueryRef.current.trim();
      if (queryToSend) {
        handleExecuteCommand(queryToSend);
      }
    });
    return () => {
      onRegisterSendMessage?.(null);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onRegisterSendMessage]);

  const handleExecuteCommand = useCallback(async (query: string, confirmed = false) => {
    if (!query.trim()) return;

    setWelcomeState(false);
    setErrorInfo(null);
    lastQueryRef.current = query;
    setStreamedResponse('');
    setStreamConfidence(undefined);
    succeededActionsRef.current = [];
    dispatch({ type: 'SET_SESSION_ACTIVE', active: true });
    dispatch({ type: 'SET_SESSION_ID', sessionId: `desktop-${Date.now()}` });

    try {
      const message = confirmed ? `${query} (user confirmed — proceed)` : query;
      const result = await window.electronAPI.chat.sendStreamMessage(
        message,
        desktopState.sessionId || `desktop-${Date.now()}`,
      );

      if (!result.success && result.error) {
        setErrorInfo({
          message: result.error,
          succeededActions: [],
          suggestions: getSuggestionsForError('general'),
        });
      }
    } catch (err) {
      setErrorInfo({
        message: err instanceof Error ? err.message : 'Unknown error',
        succeededActions: [],
        suggestions: getSuggestionsForError('general'),
      });
      dispatch({ type: 'SET_SESSION_ACTIVE', active: false });
    }
  }, [desktopState.sessionId]);

  const handleStop = useCallback(() => {
    dispatch({ type: 'RESET' });
    setErrorInfo(null);
  }, []);

  const handleUndo = useCallback(() => {
    const lastReversible = [...desktopState.history].reverse().find(a => a.reversible);
    if (lastReversible) {
      console.log('[DesktopModeExpanded] Undo requested for:', lastReversible.description);
    }
  }, [desktopState.history]);

  const handleDismissOnboarding = useCallback(() => {
    dispatch({ type: 'SET_FIRST_LAUNCH', isFirst: false });
  }, []);

  const handleExampleClick = useCallback((query: string) => {
    onSearchChange(query);
  }, [onSearchChange]);

  const handleSessionSelect = useCallback((session: DesktopSession) => {
    onSearchChange(session.lastQuery);
  }, [onSearchChange]);

  const handleNewSession = useCallback(() => {
    dispatch({ type: 'RESET' });
    setErrorInfo(null);
    setCommandHistory([]);
    setWelcomeState(true);
  }, []);

  const handleConfirmProceed = useCallback(() => {
    setConfirmationOpen(false);
    if (pendingConfirmQuery) {
      handleExecuteCommand(pendingConfirmQuery, true);
      setPendingConfirmQuery(null);
    } else if (lastQueryRef.current) {
      handleExecuteCommand(lastQueryRef.current, true);
    }
    setPendingConfirmAction(null);
  }, [pendingConfirmQuery, handleExecuteCommand]);

  const handleConfirmCancel = useCallback(() => {
    setConfirmationOpen(false);
    setPendingConfirmQuery(null);
    setPendingConfirmAction(null);
    dispatch({ type: 'SET_SESSION_ACTIVE', active: false });
    // Show cancellation in response
    setStreamedResponse('Action cancelled by user.');
    setCommandHistory(prev => [...prev, {
      id: `cmd-${Date.now()}`,
      query: lastQueryRef.current,
      response: 'Action cancelled by user.',
      actions: [],
      timestamp: Date.now(),
    }]);
  }, []);

  const handleRetry = useCallback(() => {
    if (lastQueryRef.current) {
      setErrorInfo(null);
      handleExecuteCommand(lastQueryRef.current);
    }
  }, [handleExecuteCommand]);

  const handleCopyError = useCallback(() => {
    if (errorInfo) {
      navigator.clipboard.writeText(errorInfo.message);
    }
  }, [errorInfo]);

  return (
    <div className="desktop-mode-expanded flex flex-col flex-1 min-h-0 overflow-hidden">
      {/* Confirmation Dialog */}
      <DesktopConfirmationDialog
        open={confirmationOpen}
        onOpenChange={setConfirmationOpen}
        action={pendingConfirmAction}
        onConfirm={handleConfirmProceed}
        onCancel={handleConfirmCancel}
      />

      {/* Progress Panel */}
      {desktopState.sessionActive && desktopState.progress && (
        <div className="p-[var(--spacing-4)] pb-0">
          <DesktopProgressPanel
            progress={desktopState.progress}
            reasoning={
              desktopState.progress.status === 'capturing'
                ? 'Capturing the current screen...'
                : desktopState.progress.status === 'analyzing'
                ? 'Analyzing screen content...'
                : undefined
            }
            upcomingSteps={
              desktopState.progress.actionType === 'runOCR'
                ? ['Extract text from image', 'Format results', 'Present findings']
                : undefined
            }
            metrics={{
              elapsedMs: desktopState.elapsedMs,
              confidence: streamConfidence,
              actionCount: desktopState.history.length,
            }}
            onStop={handleStop}
            onUndo={handleUndo}
            isPaused={desktopState.isPaused}
            error={errorInfo}
            canUndo={desktopState.canUndo}
            onRetry={handleRetry}
            onCopyError={handleCopyError}
            onShowHelp={() => dispatch({ type: 'SET_SHOW_SHORTCUTS', show: true })}
          />
        </div>
      )}

      {/* Welcome State or Message Area */}
      {welcomeState ? (
        <div className="flex-1 min-h-0 overflow-hidden flex flex-col">
          <DesktopWelcomeState
            onSelectExample={handleExampleClick}
            onDismissOnboarding={handleDismissOnboarding}
            isOnboarding={desktopState.firstLaunch}
            sessions={desktopState.sessions}
            activeSessionId={desktopState.sessionId}
            onSelectSession={handleSessionSelect}
            onNewSession={handleNewSession}
          />
        </div>
      ) : (
        <div className="flex-1 min-h-0 overflow-y-auto p-[var(--spacing-5)] space-y-[var(--spacing-5)]">
          {/* Command History with Responses */}
          {commandHistory.map((entry, i) => (
            <div key={entry.id} className="space-y-[var(--spacing-2)]">
              {/* User Query */}
              <div className="p-[var(--spacing-3)] bg-muted/30 rounded-[var(--radius-lg)]">
                <div className="text-xs text-muted-foreground mb-1">Command {i + 1}</div>
                <div className="text-sm text-foreground">{entry.query}</div>
              </div>
              {/* Response */}
              {entry.response && (
                <div className="p-[var(--spacing-3)] bg-desktop-primary/10 rounded-[var(--radius-lg)] border border-desktop-primary/20">
                  <div className="text-xs text-desktop-primary mb-1">Result</div>
                  <div className="text-sm text-foreground whitespace-pre-wrap">
                    {entry.response}
                  </div>
                </div>
              )}
              {/* Desktop Action History */}
              {entry.actions.length > 0 && (
                <div className="space-y-1">
                  {entry.actions.map((a, j) => (
                    <div key={j} className="text-xs text-desktop-success flex items-center gap-1 p-[var(--spacing-2)]">
                      <span className="w-2 h-2 rounded-full bg-desktop-success flex-shrink-0"></span>
                      {a.description}
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}

          {/* Current Streaming Response */}
          {streamedResponse && (
            <div className="p-[var(--spacing-3)] bg-desktop-primary/10 rounded-[var(--radius-lg)] border border-desktop-primary/20">
              <div className="text-xs text-desktop-primary mb-1">Result</div>
              <div className="text-sm text-foreground whitespace-pre-wrap">{streamedResponse}</div>
            </div>
          )}

          {/* Standalone Error (not in progress panel) */}
          {errorInfo && !desktopState.sessionActive && (
            <div className="p-[var(--spacing-3)] bg-destructive/10 rounded-[var(--radius-lg)] border border-destructive/20">
              <div className="text-xs text-destructive mb-1">Error</div>
              <div className="text-sm text-foreground">{errorInfo.message}</div>
              {errorInfo.suggestions && errorInfo.suggestions.length > 0 && (
                <div className="mt-2 space-y-1">
                  {errorInfo.suggestions.map((s, i) => (
                    <div key={i} className="text-xs text-muted-foreground">{s}</div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
