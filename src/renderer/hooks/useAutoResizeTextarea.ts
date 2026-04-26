import { useRef, useEffect, useCallback } from 'react';

interface UseAutoResizeTextareaOptions {
  value: string;
  maxHeight?: number;
}

export function useAutoResizeTextarea({
  value,
  maxHeight = 120,
}: UseAutoResizeTextareaOptions) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const autoResize = useCallback(() => {
    const textarea = textareaRef.current;
    if (textarea) {
      textarea.style.height = 'auto';
      const newHeight = Math.min(textarea.scrollHeight, maxHeight);
      textarea.style.height = `${newHeight}px`;
    }
  }, [maxHeight]);

  useEffect(() => {
    autoResize();
  }, [value, autoResize]);

  const resetHeight = useCallback(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
  }, []);

  return { textareaRef, autoResize, resetHeight };
}
