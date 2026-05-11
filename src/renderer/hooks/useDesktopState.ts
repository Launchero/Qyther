export interface DesktopProgress {
  step: number;
  maxSteps: number;
  status: 'capturing' | 'clicking' | 'typing' | 'scrolling' | 'dragging' | 'key_combo' | 'complete' | 'error';
  message: string;
}

export interface DesktopState {
  enabled: boolean;
  sessionActive: boolean;
  progress: DesktopProgress | null;
  isPaused: boolean;
  startTime: number | null;
  elapsedMs: number;
}

export type DesktopAction =
  | { type: 'TOGGLE_MODE'; enabled: boolean }
  | { type: 'SET_PROGRESS'; progress: DesktopProgress }
  | { type: 'SET_SESSION_ACTIVE'; active: boolean }
  | { type: 'SET_PAUSED'; paused: boolean }
  | { type: 'SET_ELAPSED'; elapsedMs: number }
  | { type: 'RESET' };

export const initialDesktopState: DesktopState = {
  enabled: false,
  sessionActive: false,
  progress: null,
  isPaused: false,
  startTime: null,
  elapsedMs: 0,
};

export function desktopReducer(state: DesktopState, action: DesktopAction): DesktopState {
  switch (action.type) {
    case 'TOGGLE_MODE':
      return {
        ...state,
        enabled: action.enabled,
        ...(action.enabled ? {} : { sessionActive: false, progress: null }),
      };

    case 'SET_PROGRESS':
      return {
        ...state,
        progress: action.progress,
        sessionActive: action.progress.status !== 'complete' && action.progress.status !== 'error',
        startTime: action.progress.step === 1 && !state.startTime ? Date.now() : state.startTime,
      };

    case 'SET_SESSION_ACTIVE':
      return {
        ...state,
        sessionActive: action.active,
        ...(action.active ? {} : { progress: null }),
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
        ...initialDesktopState,
        enabled: state.enabled,
      };

    default:
      return state;
  }
}
