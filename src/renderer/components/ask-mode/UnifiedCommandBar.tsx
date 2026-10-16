import React, { useEffect, useState, useCallback } from 'react';
import { PaperPlaneRightIcon, PaperclipIcon, XIcon, StopIcon } from '@phosphor-icons/react';
import { Button } from '@/components/ui/button';
import { ShortcutKey } from '@/components/common/ShortcutKeys';
import { getAriaKeyshortcuts } from '@/utils/shortcuts';
import type { AttachedFile } from '@/types/ask-types';
import { cn } from '@/lib/utils';
import { logWarn } from '../../utils/debugLogger';
import { useDragAndDrop } from '@/hooks/useDragAndDrop';
import { useAutoResizeTextarea } from '@/hooks/useAutoResizeTextarea';
import { useInputIcon } from './useInputIcon';
import { getFileIconType, FileIconForType } from './fileTypeIcons';

export interface UnifiedCommandBarProps {
  value: string;
  onChange: (value: string) => void;
  onSend: (message: string) => void;
  disabled?: boolean;
  isLoading?: boolean;
  windowMode: 'expanded' | 'compact' | 'custom';
  hasSentMessage: boolean;
  mcpCount?: number;
  onOpenMCPModal?: () => void;
  attachedFiles?: AttachedFile[];
  onRemoveFile?: (index: number) => void;
  onAttachFile?: () => void;
  onAttachFolder?: () => void;
  onAddFile?: (file: AttachedFile) => void;
  onStop?: () => void;
  registerInput?: (name: string, ref: React.RefObject<HTMLElement | null>) => () => void;
}

export function UnifiedCommandBar({
  value,
  onChange,
  onSend,
  disabled = false,
  isLoading = false,
  windowMode,
  hasSentMessage,
  mcpCount = 0,
  onOpenMCPModal,
  attachedFiles = [],
  onRemoveFile,
  onAttachFile,
  onAttachFolder: _onAttachFolder,
  onAddFile,
  onStop,
  registerInput,
}: UnifiedCommandBarProps) {
  const [hasSent, setHasSent] = useState(hasSentMessage);

  const { isDragOver, handleDragEnter, handleDragLeave, handleDragOver, handleDrop } =
    useDragAndDrop({
      onFilesDrop: (files) => {
        files.forEach((file) => {
          const filePath = (file as File & { path?: string }).path || '';
          onAddFile?.({ name: file.name, path: filePath, type: 'file' });
        });
      },
    });

  const { textareaRef, resetHeight } = useAutoResizeTextarea({
    value,
    maxHeight: 120,
  });

  // Register the unified-command textarea with the focus manager
  useEffect(() => {
    if (registerInput && textareaRef) {
      return registerInput('unified-command', textareaRef as React.RefObject<HTMLElement | null>);
    }
  }, [registerInput, textareaRef]);

  useEffect(() => {
    if (hasSentMessage !== hasSent) {
      setHasSent(hasSentMessage);
    }
  }, [hasSentMessage, hasSent]);

  const handleSend = useCallback(() => {
    if (value.trim() && !disabled && !isLoading) {
      onSend(value.trim());
      onChange('');
      setHasSent(true);
      resetHeight();
    } else {
      logWarn('[UnifiedCommandBar] Not sending - conditions not met');
    }
  }, [value, disabled, isLoading, onSend, onChange, resetHeight]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // Browsers confirm IME composition with Enter; without this bail a CJK
    // user sends a half-converted string. Mirrors useKeyboard's first branch.
    if (e.nativeEvent?.isComposing) {
      return;
    }
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const isSendActive = value.trim().length > 0;

  const InputIcon = useInputIcon(hasSent, isSendActive);

  const placeholder = hasSent
    ? 'Reply to AI... or ask a follow-up'
    : 'Ask anything about your code, files, or project...';

  return (
    <div
      className="unified-command-bar-wrapper"
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      {isDragOver && (
        <div className="drag-drop-overlay">
          <div className="drag-drop-zone">
            <PaperclipIcon className="drag-drop-icon" weight="fill" aria-hidden="true" />
            <span className="drag-drop-title">Drop files to attach</span>
            <span className="drag-drop-subtitle">Files will be added as context for your query</span>
          </div>
        </div>
      )}

      <div className="command-bar">
        {windowMode === 'compact' && !hasSent && (attachedFiles.length > 0 || mcpCount > 0) && (
          <div className="context-indicator-compact">
            {attachedFiles.length > 0 && (
              <span className="context-badge" title={`${attachedFiles.length} files attached`}>
                <PaperclipIcon className="context-badge-icon" weight="fill" aria-hidden="true" />
                {attachedFiles.length}
              </span>
            )}
            {mcpCount > 0 && (
              <span className="context-badge" title={`${mcpCount} MCP servers`}>
                <span className="mcp-status-dot" aria-hidden="true" />
                {mcpCount}
              </span>
            )}
          </div>
        )}

        <div
          className={cn(
            'unified-input-container',
            hasSent && 'expanded-input',
            isDragOver && 'drag-over'
          )}
        >
          <InputIcon
            className={cn(
              'input-icon',
              isSendActive && 'send-icon'
            )}
            weight={hasSent ? 'fill' : 'regular'}
            aria-hidden="true"
          />

          <textarea
            ref={textareaRef}
            className="unified-input"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            aria-label="Ask the AI assistant"
            aria-keyshortcuts="Enter"
            title="Send (Enter)"
            rows={1}
            disabled={disabled || isLoading}
          />

          {onAttachFile && (
            <Button
              type="button"
              variant="ghost"
              size="icon-lg"
              className={cn('attach-trigger-inline', isDragOver && 'drag-over-active')}
              onClick={onAttachFile}
              title="Attach file or folder"
              aria-label="Attach file or folder"
            >
              <PaperclipIcon weight="regular" aria-hidden="true" />
            </Button>
          )}

          {isLoading && onStop && (
            <Button
              type="button"
              variant="destructive"
              size="icon-lg"
              className="send-button"
              onClick={onStop}
              title="Stop response (Ctrl+Shift+S)"
              aria-label="Stop response"
              aria-keyshortcuts="Control+Shift+S"
            >
              <StopIcon weight="bold" aria-hidden="true" />
            </Button>
          )}

          <Button
            type="button"
            variant="default"
            size="icon-lg"
            className={cn('send-button', isSendActive && 'active')}
            onClick={handleSend}
            disabled={!isSendActive || disabled || isLoading}
            title="Send"
            aria-label="Send message"
          >
            <PaperPlaneRightIcon weight="bold" aria-hidden="true" />
          </Button>
        </div>

        {!hasSent && (
          <div className="shortcut-keys">
            <ShortcutKey alt />
            <ShortcutKey label="Space" />
          </div>
        )}
      </div>

      {(attachedFiles.length > 0 || mcpCount > 0) && windowMode !== 'compact' && (
        <div className={cn('context-chips-above-input', hasSent && 'visible', attachedFiles.length > 0 && 'visible')}>
          {attachedFiles.map((file, index) => {
            const iconType = getFileIconType(file.name);
            return (
              <div key={index} className="context-chip-above" data-file-type={iconType}>
                <FileIconForType iconType={iconType} />
                <span className="context-chip-label" title={file.name}>{file.name}</span>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-lg"
                  className="context-chip-remove"
                  onClick={() => onRemoveFile?.(index)}
                  aria-label={`Remove ${file.name} from context`}
                  title={`Remove ${file.name} from context`}
                >
                  <XIcon weight="bold" aria-hidden="true" />
                </Button>
              </div>
            );
          })}
          {mcpCount > 0 && (
            <Button
              type="button"
              variant="outline"
              size="xs"
              className="mcp-chip"
              onClick={onOpenMCPModal}
              aria-keyshortcuts={getAriaKeyshortcuts('Control', 'Shift', 'M')}
              title={`${mcpCount} MCP servers connected — click to manage`}
            >
              <span className="mcp-chip-dot" aria-hidden="true" />
              {mcpCount} MCP{mcpCount > 1 ? 's' : ''}
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
