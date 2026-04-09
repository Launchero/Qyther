import { useToast as useToastContext } from '../contexts/ToastContext';

/**
 * Hook for displaying toast notifications
 * 
 * Usage:
 * const { showToast } = useToast();
 * 
 * // Success toast
 * showToast({ type: 'success', message: 'Copied to clipboard!' });
 * 
 * // Error toast
 * showToast({ type: 'error', message: 'Failed to save' });
 * 
 * // Info toast
 * showToast({ type: 'info', message: 'Processing...' });
 * 
 * // Warning toast
 * showToast({ type: 'warning', message: 'Session expiring soon' });
 * 
 * // Custom duration (in ms)
 * showToast({ type: 'success', message: 'Saved!', duration: 5000 });
 */
export const useToast = useToastContext;
