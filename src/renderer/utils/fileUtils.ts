/**
 * Extract file type (extension) from a file name.
 * Returns empty string for folders.
 */
export function getFileTypeFromName(fileName: string, isFolder?: boolean): string {
  if (isFolder) return '';
  return fileName.split('.').pop()?.toLowerCase() || '';
}
