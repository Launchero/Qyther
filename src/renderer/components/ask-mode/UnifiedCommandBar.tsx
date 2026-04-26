import React, { useEffect, useState, useCallback } from 'react';
import { CaretDownIcon, PaperPlaneRightIcon, PaperclipIcon, XIcon, GlobeIcon } from '@phosphor-icons/react';
import { SearchWebToggle } from './SearchWebToggle';
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
  webSearchEnabled?: boolean;
  onToggleWebSearch?: () => void;
  attachedFiles?: AttachedFile[];
  onRemoveFile?: (index: number) => void;
  onAttachFile?: () => void;
  onAttachFolder?: () => void;
  onAddFile?: (file: AttachedFile) => void;
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
  webSearchEnabled = false,
  onToggleWebSearch,
  attachedFiles = [],
  onRemoveFile,
  onAttachFile,
  onAttachFolder: _onAttachFolder,
  onAddFile,
}: UnifiedCommandBarProps) {
  const [hasSent, setHasSent] = useState(hasSentMessage);

  const { isDragOver, handleDragEnter, handleDragLeave, handleDragOver, handleDrop } =
    useDragAndDrop({
      onFilesDrop: (files) => {
        files.forEach((file) => {
          const filePath = (file as any).path || '';
          onAddFile?.({ name: file.name, path: filePath, type: 'file' });
        });
      },
    });

  const { textareaRef, resetHeight } = useAutoResizeTextarea({
    value,
    maxHeight: 120,
  });

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
            <PaperclipIcon className="drag-drop-icon" weight="fill" />
            <span className="drag-drop-title">Drop files to attach</span>
            <span className="drag-drop-subtitle">Files will be added as context for your query</span>
          </div>
        </div>
      )}

      <div className="command-bar">
        {windowMode === 'compact' && !hasSent && (attachedFiles.length > 0 || mcpCount > 0 || webSearchEnabled) && (
          <div className="context-indicator-compact">
            {attachedFiles.length > 0 && (
              <span className="context-badge" title={`${attachedFiles.length} files attached`}>
                <PaperclipIcon className="context-badge-icon" weight="fill" />
                {attachedFiles.length}
              </span>
            )}
            {mcpCount > 0 && (
              <span className="context-badge" title={`${mcpCount} MCP servers`}>
                <span className="mcp-status-dot" />
                {mcpCount}
              </span>
            )}
            {webSearchEnabled && (
              <span className="context-badge" title="Web search enabled">
                <GlobeIcon className="context-badge-icon" weight="fill" />
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
          />

          <textarea
            ref={textareaRef}
            className="unified-input"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            rows={1}
            disabled={disabled || isLoading}
          />

          {onAttachFile && (
            <button
              className={cn('attach-trigger-inline', isDragOver && 'drag-over-active')}
              onClick={onAttachFile}
              title="Attach file or folder"
              type="button"
            >
              <PaperclipIcon weight="regular" />
            </button>
          )}

          {hasSent && (
            <button className="model-select-inline visible" type="button">
              <span>Qwen</span>
              <CaretDownIcon weight="bold" />
            </button>
          )}

          <button
            className={cn('send-button', isSendActive && 'active')}
            onClick={handleSend}
            disabled={!isSendActive || disabled || isLoading}
            title="Send"
            type="button"
          >
            <PaperPlaneRightIcon weight="bold" />
          </button>
        </div>

        {!hasSent && (
          <div className="shortcut-keys">
            <ShortcutKey alt />
            <ShortcutKey label="Space" />
          </div>
        )}
      </div>

      {(attachedFiles.length > 0 || mcpCount > 0 || onToggleWebSearch) && windowMode !== 'compact' && (
        <div className={cn('context-chips-above-input', hasSent && 'visible', attachedFiles.length > 0 && 'visible')}>
          {attachedFiles.map((file, index) => {
            const iconType = getFileIconType(file.name);
            return (
              <div key={index} className="context-chip-above" data-file-type={iconType}>
                <FileIconForType iconType={iconType} />
                <span className="context-chip-label" title={file.name}>{file.name}</span>
                <XIcon
                  className="context-chip-remove"
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
              type="button"
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
    </div>
  );
}
