import { BrowserProgress } from '../components/ask-mode/BrowserProgressPanel';

export interface BrowserState {
  enabled: boolean;
  sessionActive: boolean;
  sessionUrl: string | null;
  progress: BrowserProgress | null;
  isPaused: boolean;
  startTime: number | null;
  elapsedMs: number;
}

export type BrowserAction =
  | { type: 'TOGGLE_MODE'; enabled: boolean }
  | { type: 'SET_PROGRESS'; progress: BrowserProgress }
  | { type: 'SET_SESSION_ACTIVE'; active: boolean }
  | { type: 'SET_SESSION_URL'; url: string | null }
  | { type: 'SET_PAUSED'; paused: boolean }
  | { type: 'SET_ELAPSED'; elapsedMs: number }
  | { type: 'RESET' };

export const initialBrowserState: BrowserState = {
  enabled: false,
  sessionActive: false,
  sessionUrl: null,
  progress: null,
  isPaused: false,
  startTime: null,
  elapsedMs: 0,
};

export function browserReducer(state: BrowserState, action: BrowserAction): BrowserState {
  switch (action.type) {
    case 'TOGGLE_MODE':
      return {
        ...state,
        enabled: action.enabled,
        // Reset session state when toggling off
        ...(action.enabled ? {} : { sessionActive: false, sessionUrl: null, progress: null }),
      };

    case 'SET_PROGRESS':
      return {
        ...state,
        progress: action.progress,
        sessionActive: action.progress.status !== 'complete' && action.progress.status !== 'error',
        // Start timer on first progress update
        startTime: action.progress.step === 1 && !state.startTime ? Date.now() : state.startTime,
      };

    case 'SET_SESSION_ACTIVE':
      return {
        ...state,
        sessionActive: action.active,
        ...(action.active ? {} : { progress: null }),
      };

    case 'SET_SESSION_URL':
      return {
        ...state,
        sessionUrl: action.url,
      };

    case 'SET_PAUSED':
      return {
        ...state,
        isPaused: action.paused,
      };

    case 'SET_ELAPSED':
      return {
        ...state,
        elapsedMs: action.elapsedMs,
      };

    case 'RESET':
      return {
        ...initialBrowserState,
        enabled: state.enabled, // Keep enabled state
      };

    default:
      return state;
  }
}
