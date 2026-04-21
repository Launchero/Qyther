import React, { useRef, useEffect, useState } from 'react';
import { PaperclipIcon, PaperPlaneRightIcon, XIcon, FilePdf, FileCsv, Presentation, BookOpen, FileIcon } from '@phosphor-icons/react';
import { SearchWebToggle } from './ask-mode/SearchWebToggle';
import { getAriaKeyshortcuts } from '@/utils/shortcuts';

export interface AttachedFile {
  name: string;
  path: string;
  type: string;
}

interface ChatInputAreaProps {
  onSend: (message: string) => void;
  placeholder?: string;
  disabled?: boolean;
  isLoading?: boolean;
  attachedFiles?: AttachedFile[];
  onRemoveFile?: (index: number) => void;
  onAttachFile?: () => void;
  webSearchEnabled?: boolean;
  onToggleWebSearch?: () => void;
  mcpCount?: number;
  onOpenMCPModal?: () => void;
  initialQuery?: string;
  onInitialQueryHandled?: () => void;
}

export function ChatInputArea({
  onSend,
  placeholder = 'Ask anything...',
  disabled = false,
  isLoading = false,
  attachedFiles = [],
  onRemoveFile,
  onAttachFile,
  webSearchEnabled = false,
  onToggleWebSearch,
  mcpCount = 0,
  onOpenMCPModal,
  initialQuery = '',
  onInitialQueryHandled,
}: ChatInputAreaProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [value, setValue] = useState(initialQuery || '');

  useEffect(() => {
    const textarea = textareaRef.current;
    if (textarea) {
      textarea.style.height = 'auto';
      const newHeight = Math.min(textarea.scrollHeight, 100);
      textarea.style.height = `${newHeight}px`;
    }
  }, [value]);

  // Handle incoming initialQuery from header (transferred query)
  useEffect(() => {
    if (initialQuery && initialQuery !== value) {
      setValue(initialQuery);
      onInitialQueryHandled?.();
    }
  }, [initialQuery]);

  // Auto-focus textarea when initialQuery is set
  useEffect(() => {
    if (initialQuery && textareaRef.current) {
      textareaRef.current.focus();
    }
  }, [initialQuery]);

  const handleSubmit = () => {
    if (value.trim() && !disabled && !isLoading) {
      onSend(value.trim());
      setValue('');
      if (textareaRef.current) {
        textareaRef.current.style.height = 'auto';
      }
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  return (
    <div className="input-area">
      {(attachedFiles.length > 0 || mcpCount > 0 || onToggleWebSearch) && (
        <div className="input-context-chips">
          {attachedFiles.map((file, index) => {
            const ext = file.name.split('.').pop()?.toLowerCase() || '';
            const codeExts = ['ts', 'tsx', 'js', 'jsx', 'py', 'go', 'rs', 'java', 'c', 'cpp', 'h', 'css', 'html', 'json', 'yaml', 'yml', 'toml', 'md', 'sql'];
            const iconType = codeExts.includes(ext) ? 'code'
              : ['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp', 'ico'].includes(ext) ? 'image'
              : ['pdf'].includes(ext) ? 'pdf'
              : ['xls', 'xlsx', 'csv'].includes(ext) ? 'spreadsheet'
              : ['ppt', 'pptx'].includes(ext) ? 'presentation'
              : ['epub', 'mobi', 'azw3'].includes(ext) ? 'ebook'
              : 'file';

            return (
              <div key={index} className="input-context-chip">
                {iconType === 'pdf' && <FilePdf className="w-3 h-3 pdf-chip-icon" weight="regular" />}
                {iconType === 'spreadsheet' && <FileCsv className="w-3 h-3 spreadsheet-chip-icon" weight="regular" />}
                {iconType === 'presentation' && <Presentation className="w-3 h-3 presentation-chip-icon" weight="regular" />}
                {iconType === 'ebook' && <BookOpen className="w-3 h-3 ebook-chip-icon" weight="regular" />}
                {iconType === 'file' && <PaperclipIcon className="w-3 h-3" weight="regular" />}
                {iconType === 'code' && <PaperclipIcon className="w-3 h-3" weight="regular" />}
                {iconType === 'image' && <PaperclipIcon className="w-3 h-3" weight="regular" />}
                {file.name}
                <XIcon
                  className="input-context-chip-remove"
                  weight="bold"
                  onClick={() => onRemoveFile?.(index)}
                />
              </div>
            );
          })}
          {mcpCount > 0 && (
            <button
              className="mcp-chip"
              onClick={onOpenMCPModal}
              aria-keyshortcuts={getAriaKeyshortcuts('Control', 'Shift', 'M')}
              title={`${mcpCount} MCP servers connected — click to manage`}
            >
              <span className="mcp-chip-dot" />
              {mcpCount} MCP{mcpCount > 1 ? 's' : ''}
            </button>
          )}
          {onToggleWebSearch && (
            <SearchWebToggle
              enabled={webSearchEnabled}
              onToggle={onToggleWebSearch}
            />
          )}
        </div>
      )}
      <div className="input-wrapper">
        <textarea
          ref={textareaRef}
          className="chat-input"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          rows={1}
          disabled={disabled || isLoading}
        />
        <div className="input-actions">
          {onAttachFile && (
            <button
              className="input-action-btn"
              onClick={onAttachFile}
              title="Attach file"
              type="button"
            >
              <PaperclipIcon weight="regular" />
            </button>
          )}
        </div>
        <button
          className="send-button"
          onClick={handleSubmit}
          disabled={!value.trim() || disabled || isLoading}
          title="Send"
          type="button"
        >
          <PaperPlaneRightIcon weight="bold" />
        </button>
      </div>
    </div>
  );
}
