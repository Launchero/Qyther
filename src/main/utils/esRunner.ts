import { exec } from 'child_process';
import { promisify } from 'util';
import * as path from 'path';
import { getEsPath } from './esDownloader';
import { isWindows } from './platform';
import { createLogger } from './logger';

const execAsync = promisify(exec);

const log = createLogger('ESRunner');

// Interface for file search results (extended with optional fields for backward compatibility)
export interface FileSearchResult {
  path: string;
  name: string;
  size?: number;
  dateModified?: string;
  isFolder: boolean;
  // NEW optional fields (backward compatible):
  relevanceScore?: number;
  category?: 'document' | 'image' | 'code' | 'archive' | 'executable' | 'media' | 'other';
  _metadata?: {
    extension?: string;
    isHidden?: boolean;
    isSystem?: boolean;
    matchType?: 'exact' | 'prefix' | 'contains' | 'fuzzy';
  };
}

// Interface for es.exe JSON output
interface EsJsonOutput {
  Name: string;
  Path: string;
  Size?: number;
  'Date Modified'?: string;
  Extension?: string;
}

/**
 * Validate search query to prevent command injection (EXISTING - DO NOT MODIFY)
 */
function validateQuery(query: string): string {
  if (!query || typeof query !== 'string') {
    throw new Error('Search query is required');
  }

  const trimmedQuery = query.trim();
  
  if (trimmedQuery.length === 0) {
    throw new Error('Search query cannot be empty');
  }

  if (trimmedQuery.length > 500) {
    throw new Error('Search query is too long (max 500 characters)');
  }

  // Remove potentially dangerous characters
  // Allow: alphanumeric, spaces, common search operators (*, ?, -, _, ., \, /)
  const sanitizedQuery = trimmedQuery.replace(/[&|<>^]/g, '');
  
  return sanitizedQuery;
}

/**
 * NEW: Normalize query (trim, collapse spaces)
 */
function normalizeQuery(query: string): string {
  return query.trim().replace(/\s+/g, ' ');
}

/**
 * NEW: Check for es.exe-specific dangerous patterns
 */
function isSafeQuery(query: string): boolean {
  const dangerousPatterns = [
    /\b(install|uninstall|register|unregister)\b/i,
    /\b-db\b/i, // Database modification
    /\b-rebuild\b/i, // Index rebuild
  ];
  return !dangerousPatterns.some(pattern => pattern.test(query));
}

/**
 * NEW: Categorize file by extension
 */
function categorizeFile(filePath: string): FileSearchResult['category'] {
  const ext = path.extname(filePath).toLowerCase();
  const categories: Record<string, string[]> = {
    document: ['.pdf', '.doc', '.docx', '.txt', '.md', '.rtf', '.odt'],
    image: ['.jpg', '.jpeg', '.png', '.gif', '.svg', '.webp', '.bmp', '.ico'],
    code: ['.ts', '.tsx', '.js', '.jsx', '.py', '.java', '.cpp', '.c', '.h', '.cs', '.go', '.rs'],
    archive: ['.zip', '.rar', '.7z', '.tar', '.gz'],
    executable: ['.exe', '.msi', '.bat', '.cmd', '.ps1', '.sh'],
    media: ['.mp3', '.mp4', '.avi', '.mkv', '.wav', '.flac'],
  };
  
  for (const [category, extensions] of Object.entries(categories)) {
    if (extensions.includes(ext)) {
      return category as FileSearchResult['category'];
    }
  }
  
  return 'other';
}

/**
 * NEW: Calculate relevance score for result ranking
 */
function calculateRelevanceScore(result: FileSearchResult, query: string): number {
  const lowerName = result.name.toLowerCase();
  const lowerQuery = query.toLowerCase();
  const lowerPath = result.path.toLowerCase();
  
  // Exact match in filename (highest score)
  if (lowerName === lowerQuery) return 100;
  
  // Starts with query (high score)
  if (lowerName.startsWith(lowerQuery)) return 80;
  
  // Contains query in name (medium score)
  if (lowerName.includes(lowerQuery)) return 60;
  
  // Contains query in path (lower score)
  if (lowerPath.includes(lowerQuery)) return 40;
  
  // Fuzzy match (lowest score)
  return 20;
}

/**
 * NEW: Deduplicate results by path (case-insensitive)
 */
function deduplicateResults(results: FileSearchResult[]): FileSearchResult[] {
  const seen = new Map<string, FileSearchResult>();
  
  for (const result of results) {
    const key = result.path.toLowerCase();
    
    if (!seen.has(key)) {
      seen.set(key, result);
    } else {
      // Keep the one with better relevance score if available
      const existing = seen.get(key)!;
      const existingScore = existing.relevanceScore || 0;
      const newScore = result.relevanceScore || 0;
      
      if (newScore > existingScore) {
        seen.set(key, result);
      }
    }
  }
  
  return Array.from(seen.values());
}

/**
 * NEW: Filter out system/hidden files (configurable)
 */
function filterSystemFiles(
  results: FileSearchResult[],
  excludeHidden: boolean = true,
  excludeSystem: boolean = true
): FileSearchResult[] {
  if (!excludeHidden && !excludeSystem) {
    return results;
  }
  
  return results.filter(result => {
    const fileName = path.basename(result.path);
    
    // Skip hidden files (starting with .)
    if (excludeHidden && fileName.startsWith('.')) {
      return false;
    }
    
    // Skip system files
    if (excludeSystem && (
      fileName === 'pagefile.sys' ||
      fileName === 'hiberfil.sys' ||
      fileName === 'swapfile.sys' ||
      result.path.includes('$Recycle.Bin') ||
      result.path.includes('System Volume Information')
    )) {
      return false;
    }
    
    return true;
  });
}

/**
 * Process a single ES output item
 */
function processEsItem(json: unknown): FileSearchResult {
  const item = json as Record<string, unknown>;
  const fullPath = (item.filename as string) || (item.Path as string) || (item.Name as string) || '';
  const fileName = path.basename(fullPath);
  
  // Determine if it's a folder - primary check: Extension === 'Folder' (from -ext flag)
  // Fallback: folders report no Size, files always have a Size
  const isFolder = item.Extension === 'Folder' || item.FileKind === 'Folder'
    || (!item.Size && !item.size && !item.file_size && !item.FileSize);
  
  return {
    path: fullPath,
    name: fileName,
    size: (item.size || item.Size || item.file_size || item.FileSize) as number | undefined,
    dateModified: (item['date_modified'] || item['Date Modified'] || item.dateModified || item.DateModified) as string | undefined,
    isFolder,
  };
}

/**
 * Parse JSON output from es.exe
 */
function parseEsOutput(stdout: string): FileSearchResult[] {
  const results: FileSearchResult[] = [];
  
  if (!stdout || !stdout.trim()) {
    return results;
  }
  
  try {
    // Try parsing as complete JSON array first (preferred method)
    const cleanedStdout = stdout.trim();
    const dataArray = JSON.parse(cleanedStdout);
    
    if (Array.isArray(dataArray)) {
      log.info(`Parsed ${dataArray.length} items from JSON array`);
      for (const item of dataArray) {
        try {
          results.push(processEsItem(item));
        } catch (itemError) {
          log.warn('Could not process array item:', itemError);
        }
      }
      return results;
    }
  } catch (arrayParseError) {
    log.debug('Failed to parse as JSON array, trying line-by-line:', arrayParseError);
    
    // Fallback: line-by-line parsing for NDJSON format
    const lines = stdout.split('\n').filter(line => line.trim());
    
    for (const line of lines) {
      try {
        let cleanedLine = line.trim();
        
        // Skip array bracket lines
        if (cleanedLine === '[' || cleanedLine === ']' || cleanedLine === '') {
          continue;
        }
        
        // Remove leading/trailing array characters and commas
        cleanedLine = cleanedLine.replace(/^\[+|]+$/g, '');
        cleanedLine = cleanedLine.replace(/,(\s*[}\]])/g, '$1');
        cleanedLine = cleanedLine.trim();
        
        if (!cleanedLine || cleanedLine === '{' || cleanedLine === '}') {
          continue;
        }
        
        const json: EsJsonOutput = JSON.parse(cleanedLine);
        results.push(processEsItem(json));
      } catch {
        // Skip lines that can't be parsed as JSON
        log.debug('Could not parse JSON line:', line.substring(0, 100));
      }
    }
  }
  
  return results;
}

/**
 * Options for file search (NEW - backward compatible with defaults)
 */
export interface SearchOptions {
  maxResults?: number;
  excludeHidden?: boolean;
  excludeSystem?: boolean;
  includeMetadata?: boolean;
}

/**
 * Execute file search using es.exe (ENHANCED with options parameter)
 * @param query - Search query
 * @param options - Search options (backward compatible, all optional)
 * @returns Array of file search results with enhanced metadata
 */
export async function searchFiles(
  query: string,
  options?: SearchOptions
): Promise<FileSearchResult[]> {
  if (!isWindows()) {
    throw new Error('File search is only available on Windows');
  }

  const {
    maxResults = 50,
    excludeHidden = true,
    excludeSystem = true,
    includeMetadata = true,
  } = options || {};

  // Step 1: Existing validation (PRESERVED for backward compatibility)
  const sanitizedQuery = validateQuery(query);
  
  // Step 2: NEW enhanced validation (ADDITIONAL layer)
  const normalizedQuery = normalizeQuery(sanitizedQuery);
  
  if (!isSafeQuery(normalizedQuery)) {
    throw new Error('Query contains disallowed operations');
  }
  
  const esPath = getEsPath();
  
  const command = `"${esPath}" "${normalizedQuery}" -json -size -date-modified -n ${maxResults}`;
  
  log.info(`Executing: ${command}`);
  
  try {
    const { stdout, stderr } = await execAsync(command, {
      encoding: 'utf8',
      maxBuffer: 10 * 1024 * 1024, // 10MB buffer for large result sets
      timeout: 10000, // 10 second timeout
    });
    
    if (stderr) {
      log.debug('es.exe stderr:', stderr);
    }
    
    log.debug('Raw stdout length:', stdout.length, 'preview:', stdout.substring(0, 500) + '...');
    
    let results = parseEsOutput(stdout);
    
    // Step 3: Apply enhancements if metadata is requested
    if (includeMetadata) {
      // Add relevance scoring and categorization
      results = results.map(result => ({
        ...result,
        relevanceScore: calculateRelevanceScore(result, normalizedQuery),
        category: categorizeFile(result.path),
        _metadata: {
          extension: path.extname(result.path),
          isHidden: path.basename(result.path).startsWith('.'),
          isSystem: (
            path.basename(result.path) === 'pagefile.sys' ||
            path.basename(result.path) === 'hiberfil.sys' ||
            path.basename(result.path) === 'swapfile.sys' ||
            result.path.includes('$Recycle.Bin') ||
            result.path.includes('System Volume Information')
          ),
        },
      }));
      
      results = deduplicateResults(results);
      
      results = filterSystemFiles(results, excludeHidden, excludeSystem);
      
      // Sort by relevance score (highest first)
      results.sort((a, b) => (b.relevanceScore || 0) - (a.relevanceScore || 0));
    }
    
    log.info(`Found ${results.length} results for query: "${normalizedQuery}"`);
    
    if (results.length > 0) {
      log.info('First result:', results[0].path);
      if (includeMetadata) {
        log.debug('First result score:', results[0].relevanceScore, 'category:', results[0].category);
      }
    }
    
    return results;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    log.error('Search error:', errorMessage);
    
    // Check for specific error conditions
    if (errorMessage.includes('timeout')) {
      throw new Error('Search timed out. Please try a more specific query.');
    }
    
    if (errorMessage.includes('Everything IPC window not found')) {
      throw new Error('Everything is not running. Please start the Everything application.');
    }
    
    if (errorMessage.includes('not recognized') || errorMessage.includes('ENOENT')) {
      throw new Error('es.exe not found. Please restart the application to download it.');
    }
    
    throw new Error(`Search failed: ${errorMessage}`);
  }
}

/**
 * Check if the Everything application is running and accessible
 * Uses a minimal query to test the IPC connection
 */
export async function isEverythingRunning(): Promise<boolean> {
  if (!isWindows()) {
    return false;
  }

  const esPath = getEsPath();
  const command = `"${esPath}" "" -n 0`;

  try {
    await execAsync(command, {
      encoding: 'utf8',
      timeout: 3000,
    });
    return true;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : '';
    if (errorMessage.includes('Everything IPC window not found')) {
      return false;
    }
    if (errorMessage.includes('not recognized') || errorMessage.includes('ENOENT')) {
      return false;
    }
    // Other errors might mean es.exe exists but Something else failed
    log.debug('isEverythingRunning: unexpected error:', errorMessage);
    return false;
  }
}

/**
 * Format file size for display
 */
export function formatFileSize(bytes?: number): string {
  if (bytes === undefined || bytes === 0) {
    return '';
  }
  
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let unitIndex = 0;
  let size = bytes;
  
  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex++;
  }
  
  return `${size.toFixed(1)} ${units[unitIndex]}`;
}

/**
 * Format date for display
 */
export function formatDate(dateString?: string): string {
  if (!dateString) {
    return '';
  }
  
  try {
    const date = new Date(dateString);
    if (isNaN(date.getTime())) {
      return '';
    }
    return date.toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return '';
  }
}
