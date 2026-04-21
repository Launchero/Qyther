import React, { useRef, useEffect, useState, useCallback, DragEvent } from 'react';
import { BrainIcon, PaperPlaneRightIcon, SparkleIcon, CaretDownIcon, PaperclipIcon, XIcon, GlobeIcon, FileIcon, FolderIcon, FilePdf, FileCsv, Presentation, BookOpen } from '@phosphor-icons/react';
import { SearchWebToggle } from './SearchWebToggle';
import { ModeTabs, type SearchMode } from '../ModeTabs';
import { ShortcutKey } from '@/components/common/ShortcutKeys';
import { getAriaKeyshortcuts } from '@/utils/shortcuts';
import type { AttachedFile } from '../ChatInputArea';
import { cn } from '@/lib/utils';

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
  currentMode?: SearchMode;
  onModeChange?: (mode: SearchMode) => void;
  tabsExpanded?: boolean;
  onTabsExpanded?: (expanded: boolean) => void;
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
  onAttachFolder,
  onAddFile,
  currentMode = 'ai',
  onModeChange,
  tabsExpanded = false,
  onTabsExpanded,
}: UnifiedCommandBarProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const tabsContainerRef = useRef<HTMLDivElement>(null);
  const [hasSent, setHasSent] = useState(hasSentMessage);
  const [isDragOver, setIsDragOver] = useState(false);
  const dragCounterRef = useRef(0);

  // Sync with parent hasSentMessage state (both directions)
  useEffect(() => {
    if (hasSentMessage !== hasSent) {
      setHasSent(hasSentMessage);
    }
  }, [hasSentMessage, hasSent]);

  // Auto-resize textarea
  useEffect(() => {
    const textarea = textareaRef.current;
    if (textarea) {
      textarea.style.height = 'auto';
      const newHeight = Math.min(textarea.scrollHeight, 100);
      textarea.style.height = `${newHeight}px`;
    }
  }, [value]);

  // Handle mode change - close tabs and focus input (matching SearchBar behavior)
  const handleModeChange = (mode: SearchMode) => {
    onModeChange?.(mode);
    onTabsExpanded?.(false);
    textareaRef.current?.focus();
  };

  // Toggle tabs expanded state
  const handleToggleTabs = () => {
    const newState = !tabsExpanded;
    onTabsExpanded?.(newState);
  };

  // Close tabs when clicking outside (matching SearchBar behavior)
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      
      if (tabsExpanded && tabsContainerRef.current && !tabsContainerRef.current.contains(target)) {
        onTabsExpanded?.(false);
      }
    };

    document.addEventListener('click', handleClickOutside);
    return () => {
      document.removeEventListener('click', handleClickOutside);
    };
  }, [tabsExpanded, onTabsExpanded]);

  const handleSend = useCallback(() => {
    if (value.trim() && !disabled && !isLoading) {
      onSend(value.trim());
      onChange('');
      setHasSent(true);
      if (textareaRef.current) {
        textareaRef.current.style.height = 'auto';
      }
    } else {
      console.warn('[UnifiedCommandBar] Not sending - conditions not met');
    }
  }, [value, disabled, isLoading, onSend, onChange]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const isSendActive = value.trim().length > 0;

  // Determine which icon to show
  const InputIcon = hasSent ? BrainIcon : isSendActive ? PaperPlaneRightIcon : SparkleIcon;

  // Placeholder text based on state
  const placeholder = hasSent
    ? 'Reply to AI... or ask a follow-up'
    : 'Ask anything about your code, files, or project...';

  // Drag-and-drop handlers
  const handleDragEnter = useCallback((e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current++;
    if (e.dataTransfer.items && e.dataTransfer.items.length > 0) {
      setIsDragOver(true);
    }
  }, []);

  const handleDragLeave = useCallback((e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current--;
    if (dragCounterRef.current === 0) {
      setIsDragOver(false);
    }
  }, []);

  const handleDragOver = useCallback((e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleDrop = useCallback((e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
    dragCounterRef.current = 0;

    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      Array.from(e.dataTransfer.files).forEach((file: File) => {
        if (file.name) {
          // For drag-drop, we only get the filename, not the full path
          onAddFile?.({ name: file.name, path: '', type: 'file' });
        }
      });
    }
  }, [onAddFile]);

  // Format file size from name heuristics
  const getFileExtension = (name: string): string => {
    const parts = name.split('.');
    return parts.length > 1 ? parts[parts.length - 1].toLowerCase() : '';
  };

  const getFileIcon = (name: string) => {
    const ext = getFileExtension(name);
    const codeExts = ['ts', 'tsx', 'js', 'jsx', 'py', 'go', 'rs', 'java', 'c', 'cpp', 'h', 'css', 'html', 'json', 'yaml', 'yml', 'toml', 'md', 'sql'];
    if (codeExts.includes(ext)) return 'code';
    if (['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp', 'ico'].includes(ext)) return 'image';
    if (['pdf'].includes(ext)) return 'pdf';
    if (['doc', 'docx', 'txt', 'rtf', 'odt'].includes(ext)) return 'doc';
    if (['xls', 'xlsx', 'csv'].includes(ext)) return 'spreadsheet';
    if (['ppt', 'pptx'].includes(ext)) return 'presentation';
    if (['epub', 'mobi', 'azw3'].includes(ext)) return 'ebook';
    return 'file';
  };

  return (
    <div
      className="unified-command-bar-wrapper"
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      {/* Drag-and-Drop Overlay */}
      {isDragOver && (
        <div className="drag-drop-overlay">
          <div className="drag-drop-zone">
            <PaperclipIcon className="drag-drop-icon" weight="fill" />
            <span className="drag-drop-title">Drop files to attach</span>
            <span className="drag-drop-subtitle">Files will be added as context for your query</span>
          </div>
        </div>
      )}

      {/* Command Bar — mode pill + input + shortcuts (flex row) */}
      <div className="command-bar">
        {/* Mode Tabs */}
        <div ref={tabsContainerRef} className="flex-shrink-0 self-center">
          <ModeTabs
            currentMode={currentMode}
            onModeChange={handleModeChange}
            expanded={tabsExpanded}
            onToggle={handleToggleTabs}
          />
        </div>

        {/* Context Indicator Badges - Compact Mode Only */}
        {windowMode === 'compact' && !hasSent && (attachedFiles.length > 0 || mcpCount > 0 || webSearchEnabled) && (
          <div className="context-indicator-compact">
            {attachedFiles.length > 0 && (
              <span className="context-badge" title={`${attachedFiles.length} files attached`}>
                <PaperclipIcon className="w-2.5 h-2.5" weight="fill" />
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
                <GlobeIcon className="w-2.5 h-2.5" weight="fill" />
              </span>
            )}
          </div>
        )}

        {/* Unified Input Container */}
        <div
          className={cn(
            'unified-input-container',
            hasSent && 'expanded-input',
            isDragOver && 'drag-over'
          )}
        >
          {/* Dynamic Icon */}
          <InputIcon
            className={cn(
              'input-icon',
              isSendActive && 'send-icon'
            )}
            weight={hasSent ? 'fill' : 'regular'}
          />

          {/* Textarea */}
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

          {/* Attach Button — inside input container */}
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

          {/* Model Selector (visible only after sending) */}
          {hasSent && (
            <button className="model-select-inline visible" type="button">
              <span>Qwen</span>
              <CaretDownIcon weight="bold" />
            </button>
          )}

          {/* Send Button */}
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

        {/* Keyboard Shortcuts (visible only in compact mode before sending) */}
        {!hasSent && windowMode === 'compact' && (
          <div className="shortcut-keys">
            <ShortcutKey alt />
            <ShortcutKey label="Space" />
          </div>
        )}
      </div>

      {/* Context Chips — visible whenever files are attached (before AND after sending) */}
      {(attachedFiles.length > 0 || mcpCount > 0 || onToggleWebSearch) && (
        <div className={cn('context-chips-above-input', hasSent && 'visible', attachedFiles.length > 0 && 'visible')}>
          {attachedFiles.map((file, index) => {
            const iconType = getFileIcon(file.name);
            return (
              <div key={index} className="context-chip-above">
                {iconType === 'code' && <span className="chip-icon code-dot" />}
                {iconType === 'image' && <span className="chip-icon image-dot" />}
                {iconType === 'pdf' && <FilePdf className="chip-icon pdf-icon" weight="regular" />}
                {iconType === 'spreadsheet' && <FileCsv className="chip-icon spreadsheet-icon" weight="regular" />}
                {iconType === 'presentation' && <Presentation className="chip-icon presentation-icon" weight="regular" />}
                {iconType === 'ebook' && <BookOpen className="chip-icon ebook-icon" weight="regular" />}
                {iconType === 'doc' && <FileIcon className="chip-icon" weight="regular" />}
                {iconType === 'file' && <FileIcon className="chip-icon" weight="regular" />}
                {file.name}
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
