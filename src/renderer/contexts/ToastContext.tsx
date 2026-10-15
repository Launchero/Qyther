import React, { createContext, useContext, useEffect, useRef, useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { CheckCircleIcon, XCircleIcon, InfoIcon, WarningIcon, XIcon } from '@phosphor-icons/react';
import { motionDurationMs } from '../utils/motion';

export interface Toast {
  id: string;
  message: string;
  type: 'success' | 'error' | 'info' | 'warning';
  duration?: number; // ms, default 3000
}

interface ToastContextType {
  showToast: (toast: Omit<Toast, 'id'>) => void;
  dismissToast: (id: string) => void;
}

const TOAST_ICONS: Record<Toast['type'], React.ReactNode> = {
  success: <CheckCircleIcon />,
  error: <XCircleIcon />,
  info: <InfoIcon />,
  warning: <WarningIcon />,
};

const ToastContext = createContext<ToastContextType | undefined>(undefined);

/** The duration `.toast[data-state="exit"]` animates for. Reading the same token the CSS
 *  composes keeps the removal in step with the exit, and zeroes it under reduced motion. */
const TOAST_EXIT_DURATION = '--duration-150';

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [exitingIds, setExitingIds] = useState<ReadonlySet<string>>(new Set());
  const exitTimersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  const showToast = useCallback((toast: Omit<Toast, 'id'>) => {
    const id = `toast-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const newToast: Toast = {
      id,
      type: toast.type,
      message: toast.message,
      duration: toast.duration || 3000,
    };

    setToasts(prev => [...prev, newToast]);
  }, []);

  const removeToast = useCallback((id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id));
    setExitingIds(prev => {
      if (!prev.has(id)) return prev;
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  }, []);

  const dismissToast = useCallback((id: string) => {
    setExitingIds(prev => (prev.has(id) ? prev : new Set(prev).add(id)));
    const previous = exitTimersRef.current.get(id);
    if (previous) clearTimeout(previous);
    exitTimersRef.current.set(id, setTimeout(() => {
      exitTimersRef.current.delete(id);
      removeToast(id);
    }, motionDurationMs(TOAST_EXIT_DURATION, 150)));
  }, [removeToast]);

  // A toast dismissed while the palette was hidden would otherwise fire into an unmounted tree.
  useEffect(() => {
    const timers = exitTimersRef.current;
    return () => {
      timers.forEach(clearTimeout);
      timers.clear();
    };
  }, []);

  const informational = toasts.filter(toast => toast.type !== 'error');
  const failures = toasts.filter(toast => toast.type === 'error');

  return (
    <ToastContext.Provider value={{ showToast, dismissToast }}>
      {children}
      {/* Portalled into `document.body`, next to the Radix portals. `.toast-region` is
       *  `position: fixed` at `--z-toast`, but this provider mounts deep inside the palette
       *  subtree (`AskModeExpanded`), so any ancestor that animates a transform becomes the
       *  region's containing block and its layer is capped by that ancestor's own — a toast
       *  could then never paint above a `--z-modal` dialog. The root stacking context is the
       *  only place `--z-toast: 70` means anything. */}
      {createPortal(
        <div className="toast-region">
          <div className="toast-container" role="status" aria-live="polite" aria-relevant="additions">
            {informational.map(toast => (
              <ToastItem
                key={toast.id}
                toast={toast}
                isExiting={exitingIds.has(toast.id)}
                onDismiss={dismissToast}
              />
            ))}
          </div>
          <div className="toast-container" role="alert" aria-live="assertive" aria-relevant="additions">
            {failures.map(toast => (
              <ToastItem
                key={toast.id}
                toast={toast}
                isExiting={exitingIds.has(toast.id)}
                onDismiss={dismissToast}
              />
            ))}
          </div>
        </div>,
        document.body,
      )}
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextType {
  const context = useContext(ToastContext);
  if (context === undefined) {
    throw new Error('useToast must be used within a ToastProvider');
  }
  return context;
}

interface ToastItemProps {
  toast: Toast;
  isExiting: boolean;
  onDismiss: (id: string) => void;
}

function ToastItem({ toast, isExiting, onDismiss }: ToastItemProps) {
  const [isPaused, setIsPaused] = useState(false);
  const remainingRef = useRef(toast.duration || 0);

  useEffect(() => {
    if (isPaused || !toast.duration || toast.duration <= 0) return;
    const startedAt = Date.now();
    const timer = setTimeout(() => onDismiss(toast.id), remainingRef.current);
    return () => {
      clearTimeout(timer);
      remainingRef.current = Math.max(0, remainingRef.current - (Date.now() - startedAt));
    };
  }, [isPaused, toast.id, toast.duration, onDismiss]);

  return (
    <div
      className={`toast toast-${toast.type}`}
      data-paused={isPaused ? 'true' : 'false'}
      data-state={isExiting ? 'exit' : undefined}
      onClick={() => onDismiss(toast.id)}
      onMouseEnter={() => setIsPaused(true)}
      onMouseLeave={() => setIsPaused(false)}
    >
      <span className="toast-icon" aria-hidden="true">
        {TOAST_ICONS[toast.type]}
      </span>
      <span className="toast-message">{toast.message}</span>
      <button className="toast-dismiss-btn" onClick={() => onDismiss(toast.id)} aria-label="Dismiss">
        <XIcon />
      </button>
      {toast.duration && toast.duration > 0 && (
        <div className="toast-progress-bar">
          <div className="toast-progress-fill" style={{ animationDuration: `${toast.duration}ms` }} />
        </div>
      )}
    </div>
  );
}
