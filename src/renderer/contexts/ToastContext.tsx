import React, { createContext, useContext, useState, useCallback } from 'react';
import { CheckCircleIcon, XCircleIcon, InfoIcon, WarningIcon, XIcon } from '@phosphor-icons/react';

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

const ToastContext = createContext<ToastContextType | undefined>(undefined);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const showToast = useCallback((toast: Omit<Toast, 'id'>) => {
    const id = `toast-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const newToast: Toast = {
      id,
      type: toast.type,
      message: toast.message,
      duration: toast.duration || 3000,
    };

    setToasts(prev => [...prev, newToast]);

    // Auto-dismiss after duration
    if (newToast.duration && newToast.duration > 0) {
      setTimeout(() => {
        setToasts(prev => prev.filter(t => t.id !== id));
      }, newToast.duration);
    }
  }, []);

  const dismissToast = useCallback((id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  return (
    <ToastContext.Provider value={{ showToast, dismissToast }}>
      {children}
      {/* Toast Container will be rendered where this provider is used */}
      <div className="toast-container">
        {toasts.map(toast => (
          <ToastItem
            key={toast.id}
            toast={toast}
            onDismiss={() => dismissToast(toast.id)}
          />
        ))}
      </div>
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
  onDismiss: () => void;
}

function ToastItem({ toast, onDismiss }: ToastItemProps) {
  const getIcon = () => {
    switch (toast.type) {
      case 'success':
        return <CheckCircleIcon />;
      case 'error':
        return <XCircleIcon />;
      case 'info':
        return <InfoIcon />;
      case 'warning':
        return <WarningIcon />;
    }
  };

  const getColor = () => {
    switch (toast.type) {
      case 'success':
        return '#10b981';
      case 'error':
        return '#ef4444';
      case 'info':
        return '#3b82f6';
      case 'warning':
        return '#f59e0b';
    }
  };

  const color = getColor();

  return (
    <div 
      className={`toast toast-${toast.type}`}
      role="status"
      aria-live="polite"
      onClick={onDismiss}
    >
      <div className="toast-icon" style={{ color }}>
        {getIcon()}
      </div>
      <span className="toast-message">{toast.message}</span>
      <button className="toast-dismiss-btn" onClick={onDismiss} aria-label="Dismiss">
        <XIcon />
      </button>
      {/* Progress bar for auto-dismiss */}
      {toast.duration && toast.duration > 0 && (
        <div className="toast-progress-bar">
          <div 
            className="toast-progress-fill"
            style={{ 
              backgroundColor: color,
              animationDuration: `${toast.duration}ms`
            }}
          />
        </div>
      )}
    </div>
  );
}
