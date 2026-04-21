import React, { useRef, useState, useEffect } from 'react';
import { cn } from '@/lib/utils';
import { CircleDashed, FileTs, FileJs, FileText, Folder, File } from '@phosphor-icons/react';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { getFuzzyMatchIndices } from '@/utils/fuzzySearch';
import { getFileTypeFromName } from '@/utils/fileUtils';

// Hook to detect if an element's text is truncated
function useTruncated(ref: React.RefObject<HTMLElement | null>) {
  const [isTruncated, setIsTruncated] = useState(false);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;

    const check = () => {
      setIsTruncated(element.scrollWidth > element.clientWidth);
    };

    check();

    const observer = new ResizeObserver(check);
    observer.observe(element);

    return () => observer.disconnect();
  }, [ref]);

  return isTruncated;
}

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

function buildHighlightPart(
  text: string,
  isHighlighted: boolean,
  isSelected: boolean | undefined,
  partIndex: number,
): React.JSX.Element {
  return (
    <span
      key={`highlight-${partIndex}`}
      className={cn(
        isHighlighted && "font-semibold",
        isHighlighted
          ? isSelected
            ? "text-primary-foreground"
            : "text-primary"
          : isSelected
            ? "text-primary-foreground"
            : "text-foreground",
      )}
    >
      {text}
    </span>
  );
}

function highlightFuzzyMatches(text: string, query: string, isSelected?: boolean) {
  if (!query || query.trim().length === 0) return text;

  const indices = getFuzzyMatchIndices(query, text);
  if (indices.length === 0) return text;

  const indexSet = new Set(indices);
  const parts: (string | React.JSX.Element)[] = [];
  let currentRun: string[] = [];
  let inHighlight = indexSet.has(0);
  let partIndex = 0;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    const shouldHighlight = indexSet.has(i);

    if (shouldHighlight === inHighlight) {
      currentRun.push(char);
    } else {
      parts.push(buildHighlightPart(currentRun.join(''), inHighlight, isSelected, partIndex++));
      currentRun = [char];
      inHighlight = shouldHighlight;
    }
  }

  if (currentRun.length > 0) {
    parts.push(buildHighlightPart(currentRun.join(''), inHighlight, isSelected, partIndex++));
  }

  return <>{parts}</>;
}

function highlightMatches(text: string, query: string, isSelected?: boolean) {
  if (!query || query.trim().length === 0) return text;

  const escapedQuery = query.trim();
  const lowerText = text.toLowerCase();
  const lowerQuery = escapedQuery.toLowerCase();

  // Find all match positions
  const matches: Array<{ start: number; end: number }> = [];
  let searchStart = 0;

  while (searchStart < text.length) {
    const matchIndex = lowerText.indexOf(lowerQuery, searchStart);
    if (matchIndex === -1) break;

    matches.push({
      start: matchIndex,
      end: matchIndex + escapedQuery.length
    });
    searchStart = matchIndex + escapedQuery.length;
  }

  if (matches.length === 0) return text;

  // Build parts array with highlights
  const parts: (string | React.JSX.Element)[] = [];
  let lastIndex = 0;

  matches.forEach((match, index) => {
    // Add text before match
    if (match.start > lastIndex) {
      parts.push(text.slice(lastIndex, match.start));
    }

    // Add highlighted match with different styling for selected state
    parts.push(
      <mark
        key={index}
        className={cn(
          "px-0.5 rounded font-semibold",
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

  // Add remaining text
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

/**
 * Maps file extensions to human-readable kind labels
 * Follows consistent naming: "<Format> <Type>" for documents, "<Language>" for code
 */
function getKindFromFileType(fileType: string, resultType?: string): string {
  // Document formats
  const documentTypes: Record<string, string> = {
    pdf: 'PDF Document',
    doc: 'Word Document',
    docx: 'Word Document',
    txt: 'Text File',
    rtf: 'Rich Text',
    odt: 'OpenDocument',
  };

  // Shorter alternatives:
  const spreadsheetTypes: Record<string, string> = {
    xls: 'Excel Sheet',
    xlsx: 'Excel Sheet',
    csv: 'CSV File',
    ods: 'OpenDocument Sheet',
  };

  // Presentation formats
  const presentationTypes: Record<string, string> = {
    ppt: 'PowerPoint',
    pptx: 'PowerPoint',
    odp: 'OpenDocument',
  };

  // Image formats
  const imageTypes: Record<string, string> = {
    png: 'PNG Image',
    jpg: 'JPEG Image',
    jpeg: 'JPEG Image',
    gif: 'GIF Image',
    svg: 'SVG Image',
    webp: 'WebP Image',
    bmp: 'Bitmap Image',
    ico: 'Icon File',
  };

  // Video formats
  const videoTypes: Record<string, string> = {
    mp4: 'MP4 Video',
    mov: 'QuickTime',
    avi: 'AVI Video',
    mkv: 'Matroska Video',
    webm: 'WebM Video',
  };

  // Audio formats
  const audioTypes: Record<string, string> = {
    mp3: 'MP3 Audio',
    wav: 'WAV Audio',
    flac: 'FLAC Audio',
    aac: 'AAC Audio',
    ogg: 'OGG Audio',
    m4a: 'M4A Audio',
  };

  // Archive formats
  const archiveTypes: Record<string, string> = {
    zip: 'ZIP Archive',
    rar: 'RAR Archive',
    '7z': '7Z Archive',
    tar: 'TAR Archive',
    gz: 'GZIP Archive',
    bz2: 'BZIP2 Archive',
  };

  // Code formats
  const codeTypes: Record<string, string> = {
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

  // Executable formats
  const executableTypes: Record<string, string> = {
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

  // Combine all type maps
  const allTypes = {
    ...documentTypes,
    ...spreadsheetTypes,
    ...presentationTypes,
    ...imageTypes,
    ...videoTypes,
    ...audioTypes,
    ...archiveTypes,
    ...codeTypes,
    ...executableTypes,
  };

  const kind = allTypes[fileType.toLowerCase()];
  if (kind) return kind;

  // Fallbacks for unknown types
  if (resultType === 'app') return 'Application';
  if (resultType === 'command') return 'Command';
  if (resultType === 'url') return 'URL';

  // Generic fallback with capitalized extension (capped to 8 chars to prevent overflow)
  return fileType ? `${fileType.toUpperCase().slice(0, 8)} File` : 'File';
}

export function ResultItem({ 
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
  const kindRef = useRef<HTMLSpanElement>(null);
  const titleTruncated = useTruncated(titleRef);
  const pathTruncated = useTruncated(pathRef);
  const kindTruncated = useTruncated(kindRef);

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
    console.debug('[ResultItem]', { id, title, fileType, isFolder: resolvedIsFolder, path, kind, shortcut });
  }

  return (
    <div
      id={id}
      data-type={resultType}
      onClick={onClick}
      onKeyDown={handleKeyDown}
      role="option"
      aria-selected={isSelected}
      tabIndex={isSelected ? 0 : -1}
      className={cn(
        "grid grid-cols-[28px_1fr_auto] gap-3 px-4 py-2 cursor-pointer group",
        "transition-colors duration-[var(--duration-150)] ease-[var(--easing-smooth)]",
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
        "transition-colors duration-100",
        isSelected ? "text-primary-foreground" : getFileTypeColor(fileType, isFolder)
      )}>
        {icon ? (
          <span className="text-lg">{icon}</span>
        ) : (
          getFileTypeIcon(fileType, isFolder)
        )}
      </div>

      {/* Content - Title and Path stacked */}
      <div className="min-w-0 flex flex-col">
        {/* Title with tooltip when truncated */}
        {titleTruncated ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <span
                ref={titleRef}
                className={cn(
                  "text-sm font-medium truncate tracking-tight",
                  isSelected ? "text-primary-foreground" : "text-foreground"
                )}
              >
                {searchQuery ? highlightFuzzyMatches(title, searchQuery, isSelected) : title}
              </span>
            </TooltipTrigger>
            <TooltipContent side="bottom" align="start" sideOffset={4}>
              {title}
            </TooltipContent>
          </Tooltip>
        ) : (
          <span
            ref={titleRef}
            className={cn(
              "text-sm font-medium truncate tracking-tight",
              isSelected ? "text-primary-foreground" : "text-foreground"
            )}
          >
            {searchQuery ? highlightMatches(title, searchQuery, isSelected) : title}
          </span>
        )}

        {/* Path with tooltip when truncated */}
        {path && (
          <>
            {pathTruncated ? (
              <Tooltip>
                <TooltipTrigger asChild>
                <span
                  ref={pathRef}
                  className={cn(
                    "font-mono truncate text-xs",
                    isSelected ? "text-primary-foreground/70" : "text-muted-foreground"
                  )}
                >
                    {path}
                  </span>
                </TooltipTrigger>
                <TooltipContent side="bottom" align="start" sideOffset={4}>
                  {path}
                </TooltipContent>
              </Tooltip>
            ) : (
                <span
                  ref={pathRef}
                  className={cn(
                    "font-mono truncate text-xs",
                    isSelected ? "text-primary-foreground/70" : "text-muted-foreground"
                  )}
                >
                {path}
              </span>
            )}
          </>
        )}
      </div>

      {/* Meta section - Kind + Shortcut */}
      <div className="flex items-center gap-1.5 self-center min-w-0">
        {/* Kind label with truncation */}
        <Tooltip>
          <TooltipTrigger asChild>
            <span
              ref={kindRef}
              className={cn(
                "text-xs whitespace-nowrap truncate max-w-[140px]",
                isSelected ? "text-primary-foreground/70" : "text-muted-foreground"
              )}
            >
              {kind}
            </span>
          </TooltipTrigger>
          {kindTruncated && (
            <TooltipContent side="bottom" align="end" sideOffset={4}>
              {kind}
            </TooltipContent>
          )}
        </Tooltip>

        {/* Shortcut badge */}
        <span className={cn(
          "text-xs font-mono px-1.5 py-0.5 rounded-[var(--radius-sm)]",
          isSelected
            ? "bg-primary-foreground/20 text-primary-foreground"
            : "bg-muted text-muted-foreground"
        )}>
          {shortcut}
        </span>
      </div>

      {/* Executing indicator */}
      {isExecuting && (
        <div className="flex-shrink-0">
          <CircleDashed weight="fill" className={cn(
            "h-5 w-5 animate-spin",
            isSelected ? "text-primary-foreground" : "text-[var(--color-green-500)]"
          )} />
        </div>
      )}
    </div>
  );
}