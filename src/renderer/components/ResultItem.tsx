import React, { useRef, memo } from 'react';
import { cn } from '@/lib/utils';
import { CircleDashed, FileTs, FileJs, FileText, Folder, File, Sparkle } from '@phosphor-icons/react';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { getFileTypeFromName } from '@/utils/fileUtils';
import { logDebug } from '../utils/debugLogger';

export interface ResultItemProps {
  id: string;
  title: string;
  subtitle?: string;
  icon?: string;
  isSelected: boolean;
  onClick: () => void;
  resultType?: 'app' | 'command' | 'url' | 'file';
  searchQuery?: string;
  isExecuting?: boolean;
  metadata?: {
    path?: string;
    isFolder?: boolean;
    fileType?: string;
    kind?: string;
    shortcut?: string;
  };
  onAskAbout?: () => void;
}

/** Every case-insensitive occurrence range of `query` inside `text`. */
function collectMatchRanges(text: string, query: string): Array<{ start: number; end: number }> {
  const lowerText = text.toLowerCase();
  const lowerQuery = query.toLowerCase();
  const matches: Array<{ start: number; end: number }> = [];
  let searchStart = 0;

  while (searchStart < text.length) {
    const matchIndex = lowerText.indexOf(lowerQuery, searchStart);
    if (matchIndex === -1) break;

    matches.push({ start: matchIndex, end: matchIndex + query.length });
    searchStart = matchIndex + query.length;
  }

  return matches;
}

function highlightMatches(text: string, query: string, isSelected?: boolean) {
  if (!query || query.trim().length === 0) return text;

  const trimmedQuery = query.trim();
  const matches = collectMatchRanges(text, trimmedQuery);
  if (matches.length === 0) return text;

  const parts: (string | React.JSX.Element)[] = [];
  let lastIndex = 0;

  matches.forEach((match, index) => {
    if (match.start > lastIndex) {
      parts.push(text.slice(lastIndex, match.start));
    }

    parts.push(
      <mark
        key={index}
        className={cn(
          "px-0.5 rounded-xs font-semibold",
          isSelected
            ? "bg-primary-foreground/30 text-primary-foreground"
            : "bg-primary/20 text-primary"
        )}
      >
        {text.slice(match.start, match.end)}
      </mark>
    );

    lastIndex = match.end;
  });

  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }

  return <>{parts}</>;
}
function getFileTypeIcon(fileType: string, isFolder?: boolean) {
  if (isFolder) {
    return <Folder weight="fill" className="h-5 w-5" />;
  }
  
  switch (fileType) {
    case 'tsx':
      return <FileTs weight="fill" className="h-5 w-5" />;
    case 'ts':
      return <FileTs weight="fill" className="h-5 w-5" />;
    case 'js':
      return <FileJs weight="fill" className="h-5 w-5" />;
    case 'jsx':
      return <FileJs weight="fill" className="h-5 w-5" />;
    case 'json':
      return <FileText weight="fill" className="h-5 w-5" />;
    default:
      return <File weight="fill" className="h-5 w-5" />;
  }
}

function getFileTypeColor(fileType: string, isFolder?: boolean): string {
  if (isFolder) return 'text-primary';
  
  switch (fileType) {
    case 'tsx':
    case 'ts':
      return 'text-[var(--color-file-typescript)]';
    case 'js':
    case 'jsx':
      return 'text-[var(--color-file-javascript)]';
    case 'json':
      return 'text-[var(--color-file-javascript)]';
    default:
      return 'text-muted-foreground';
  }
}

// Extension -> kind label maps, hoisted to module scope: they are static data, and building
// nine object literals plus their merge on every rendered row was pure waste.
const DOCUMENT_TYPES: Record<string, string> = {
  pdf: 'PDF Document',
  doc: 'Word Document',
  docx: 'Word Document',
  txt: 'Text File',
  rtf: 'Rich Text',
  odt: 'OpenDocument',
};

const SPREADSHEET_TYPES: Record<string, string> = {
  xls: 'Excel Sheet',
  xlsx: 'Excel Sheet',
  csv: 'CSV File',
  ods: 'OpenDocument Sheet',
};

const PRESENTATION_TYPES: Record<string, string> = {
  ppt: 'PowerPoint',
  pptx: 'PowerPoint',
  odp: 'OpenDocument',
};

const IMAGE_TYPES: Record<string, string> = {
  png: 'PNG Image',
  jpg: 'JPEG Image',
  jpeg: 'JPEG Image',
  gif: 'GIF Image',
  svg: 'SVG Image',
  webp: 'WebP Image',
  bmp: 'Bitmap Image',
  ico: 'Icon File',
};

const VIDEO_TYPES: Record<string, string> = {
  mp4: 'MP4 Video',
  mov: 'QuickTime',
  avi: 'AVI Video',
  mkv: 'Matroska Video',
  webm: 'WebM Video',
};

const AUDIO_TYPES: Record<string, string> = {
  mp3: 'MP3 Audio',
  wav: 'WAV Audio',
  flac: 'FLAC Audio',
  aac: 'AAC Audio',
  ogg: 'OGG Audio',
  m4a: 'M4A Audio',
};

const ARCHIVE_TYPES: Record<string, string> = {
  zip: 'ZIP Archive',
  rar: 'RAR Archive',
  '7z': '7Z Archive',
  tar: 'TAR Archive',
  gz: 'GZIP Archive',
  bz2: 'BZIP2 Archive',
};

const CODE_TYPES: Record<string, string> = {
  tsx: 'TypeScript React',
  ts: 'TypeScript',
  jsx: 'JavaScript React',
  js: 'JavaScript',
  json: 'JSON',
  html: 'HTML',
  htm: 'HTML',
  css: 'CSS',
  scss: 'SCSS',
  sass: 'Sass',
  less: 'LESS',
  py: 'Python',
  rb: 'Ruby',
  go: 'Go',
  rs: 'Rust',
  java: 'Java',
  kt: 'Kotlin',
  swift: 'Swift',
  cpp: 'C++',
  c: 'C',
  h: 'C Header',
  hpp: 'C++ Header',
  cs: 'C#',
  php: 'PHP',
  sql: 'SQL',
  sh: 'Shell Script',
  bash: 'Bash Script',
  zsh: 'Zsh Script',
  ps1: 'PowerShell',
  yaml: 'YAML',
  yml: 'YAML',
  xml: 'XML',
  md: 'Markdown',
  markdown: 'Markdown',
  dockerfile: 'Dockerfile',
  env: 'Environment File',
  gitignore: 'Git Ignore',
  config: 'Configuration',
  ini: 'INI File',
  toml: 'TOML File',
};

const EXECUTABLE_TYPES: Record<string, string> = {
  exe: 'Windows Executable',
  msi: 'Windows Installer',
  dmg: 'macOS Disk Image',
  pkg: 'macOS Package',
  deb: 'Debian Package',
  rpm: 'RPM Package',
  appimage: 'AppImage',
  snap: 'Snap Package',
  flatpak: 'Flatpak',
};

const KIND_BY_EXTENSION: Record<string, string> = {
  ...DOCUMENT_TYPES,
  ...SPREADSHEET_TYPES,
  ...PRESENTATION_TYPES,
  ...IMAGE_TYPES,
  ...VIDEO_TYPES,
  ...AUDIO_TYPES,
  ...ARCHIVE_TYPES,
  ...CODE_TYPES,
  ...EXECUTABLE_TYPES,
};

/**
 * Maps file extensions to human-readable kind labels
 * Follows consistent naming: "<Format> <Type>" for documents, "<Language>" for code
 */
function getKindFromFileType(fileType: string, resultType?: string): string {
  const kind = KIND_BY_EXTENSION[fileType.toLowerCase()];
  if (kind) return kind;

  // Fallbacks for unknown types
  if (resultType === 'app') return 'Application';
  if (resultType === 'command') return 'Command';
  if (resultType === 'url') return 'URL';

  // Generic fallback with capitalized extension (capped to 8 chars to prevent overflow)
  return fileType ? `${fileType.toUpperCase().slice(0, 8)} File` : 'File';
}

export const ResultItem = memo(function ResultItem({ 
  title, 
  subtitle, 
  icon, 
  isSelected, 
  onClick,
  id,
  resultType,
  searchQuery,
  isExecuting,
  metadata,
  onAskAbout
}: ResultItemProps) {
  const titleRef = useRef<HTMLSpanElement>(null);
  const pathRef = useRef<HTMLSpanElement>(null);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onClick();
    }
  };

  const path = metadata?.path || subtitle;
  const isFolder = metadata?.isFolder || false;
  // Also treat paths ending with separator as folders
  const isFolderFromPath = path ? path.endsWith('\\') || path.endsWith('/') : false;
  const resolvedIsFolder = isFolder || isFolderFromPath;
  const fileType = metadata?.fileType || getFileTypeFromName(title, resolvedIsFolder);
  const kind = metadata?.kind || (resolvedIsFolder ? 'Folder' : getKindFromFileType(fileType, resultType));
  const shortcut = metadata?.shortcut || (resolvedIsFolder ? '→' : '↵');

  if (import.meta.env.DEV && import.meta.env.VITE_DEBUG_SEARCH === 'true') {
    logDebug('[ResultItem]', { id, title, fileType, isFolder: resolvedIsFolder, path, kind, shortcut });
  }

  return (
    <div
      id={id}
      data-type={resultType}
      onClick={onClick}
      onKeyDown={handleKeyDown}
      role="option"
      aria-selected={isSelected}
      data-selected={isSelected || undefined}
      tabIndex={isSelected ? 0 : -1}
      className={cn(
        // One row of the 4pt rhythm: --padding-block-row, a --spacing-7 icon track, a title/path
        // track that may shrink to nothing (min-width 0 truncation), a meta track that shrinks
        // before it, and a zero-width executing track that only opens when the spinner mounts.
        "grid grid-cols-[var(--spacing-7)_minmax(0,1fr)_minmax(0,auto)_auto] gap-3 px-4 py-[var(--padding-block-row)] cursor-pointer group",
        "relative",
        isSelected 
          ? "bg-primary text-primary-foreground" 
          : "hover:bg-primary/10 hover:text-foreground"
      )}
    >
      {/* Selected indicator - left border */}
      {isSelected && (
        <div className={cn(
          "absolute left-0 top-2.5 bottom-2.5 w-px rounded-r-sm",
          "bg-primary-foreground"
        )} />
      )}

      {/* Icon */}
      <div className={cn(
        "flex-shrink-0 w-7 h-7 flex items-center justify-center",
        "transition-colors duration-[var(--duration-100)]",
        isSelected ? "text-primary-foreground" : getFileTypeColor(fileType, isFolder)
      )}>
        {icon ? (
          <span className="text-lg" aria-hidden="true">{icon}</span>
        ) : (
          <span aria-hidden="true">{getFileTypeIcon(fileType, isFolder)}</span>
        )}
      </div>

      {/* Content - Title and Path stacked */}
      <div className="min-w-0 flex flex-col">
        {/* Title */}
        <span
          ref={titleRef}
          className={cn(
            "text-sm font-medium truncate tracking-tight",
            isSelected ? "text-primary-foreground" : "text-foreground"
          )}
          title={title}
        >
          {searchQuery ? highlightMatches(title, searchQuery, isSelected) : title}
        </span>

        {/* Path */}
        {path && (
          <span
            ref={pathRef}
            className={cn(
              "font-mono truncate text-xs",
              isSelected ? "text-primary-foreground" : "text-muted-foreground"
            )}
            title={path}
          >
            {path}
          </span>
        )}
      </div>

      {/* Meta section - Kind + Shortcut */}
      <div className="flex items-center gap-[var(--gap-inline)] self-center min-w-0">
        {/* Kind label — truncates against the meta track (minmax(0,auto)), no invented cap */}
        <span
          className={cn(
            "text-xs min-w-0 truncate",
            isSelected ? "text-primary-foreground" : "text-muted-foreground"
          )}
          title={kind}
        >
          {kind}
        </span>

        {/* AI Ask hint - shown on hover for file results */}
        {resultType === 'file' && onAskAbout && (
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onAskAbout();
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.stopPropagation();
                  }
                }}
                aria-label={`Ask about ${title}`}
                className={cn(
                  "opacity-0 group-hover:opacity-100 focus-visible:opacity-100",
                  "transition-[opacity,background-color] duration-[var(--duration-150)] ease-[var(--easing-smooth)]",
                  "text-xs flex items-center gap-1 px-[var(--gap-inline)] py-[var(--spacing-1)] rounded-sm",
                  "cursor-pointer flex-shrink-0",
                  isSelected
                    ? "bg-primary-foreground/20 text-primary-foreground hover:bg-primary-foreground/30"
                    : "bg-primary/10 text-primary hover:bg-primary/20"
                )}
                type="button"
              >
                <Sparkle weight="fill" className="h-3 w-3" aria-hidden="true" />
                <span className="font-medium">Ask</span>
              </button>
            </TooltipTrigger>
            <TooltipContent side="bottom" align="end" sideOffset={4}>
              Ask about this file (Alt+Enter)
            </TooltipContent>
          </Tooltip>
        )}

        {/* Shortcut badge */}
        <span className={cn(
          "text-xs font-mono px-[var(--gap-inline)] py-[var(--spacing-1)] rounded-sm flex-shrink-0",
          isSelected
            ? "bg-primary-foreground/20 text-primary-foreground"
            : "bg-muted text-muted-foreground"
        )}>
          {shortcut}
        </span>
      </div>

      {/* Executing indicator */}
      {isExecuting && (
        <div className="flex-shrink-0 self-center">
          <CircleDashed
            weight="fill"
            aria-hidden="true"
            className={cn(
              "h-5 w-5 animate-spin",
              isSelected ? "text-primary-foreground" : "text-success"
            )}
          />
          <span className="sr-only">Opening…</span>
        </div>
      )}
    </div>
  );
});