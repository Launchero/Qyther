import { useState, useCallback } from 'react';
import type { AttachedFile } from '../types/ask-types';
import { logError } from '../utils/debugLogger';

export function useContextAttachments() {
  const [attachedFiles, setAttachedFiles] = useState<AttachedFile[]>([]);

  const addFile = useCallback((file: AttachedFile) => {
    setAttachedFiles(prev => [...prev, file]);
  }, []);

  const removeFile = useCallback((index: number) => {
    setAttachedFiles(prev => prev.filter((_, i) => i !== index));
  }, []);

  const clearFiles = useCallback(() => {
    setAttachedFiles([]);
  }, []);

  const openFilePicker = useCallback(async () => {
    try {
      const { dialog } = window.electronAPI;
      const result = await dialog.openFile({
        filters: [
          { name: 'All Supported Files', extensions: [
            'pdf', 'doc', 'docx', 'ppt', 'pptx', 'xls', 'xlsx',
            'txt', 'md', 'csv', 'json', 'html', 'epub', 'rtf', 'odt',
            'js', 'ts', 'tsx', 'jsx', 'py', 'css', 'yaml', 'yml', 'toml',
          ]},
          { name: 'Documents', extensions: ['pdf', 'doc', 'docx', 'epub', 'rtf', 'odt'] },
          { name: 'Spreadsheets', extensions: ['xls', 'xlsx', 'csv'] },
          { name: 'Presentations', extensions: ['ppt', 'pptx'] },
          { name: 'Code & Text', extensions: ['txt', 'md', 'json', 'js', 'ts', 'tsx', 'py', 'html', 'css', 'yaml', 'yml', 'toml'] },
          { name: 'All Files', extensions: ['*'] },
        ],
      });
      if (result && result.path && !result.cancelled) {
        const fileName = result.path.split(/[\\/]/).pop() || 'file';
        addFile({ name: fileName, path: result.path, type: 'file' });
      } else if (result?.error) {
        logError('[useContextAttachments] File picker failed:', result.error);
      }
    } catch (error) {
      logError('[useContextAttachments] File picker error:', error);
    }
  }, [addFile]);

  const openFolderPicker = useCallback(async () => {
    try {
      const { dialog } = window.electronAPI;
      const result = await dialog.openFolder({});
      if (result && result.path && !result.cancelled) {
        const folderName = result.path.split(/[\\/]/).pop() || 'folder';
        addFile({ name: folderName, path: result.path, type: 'file' });
      } else if (result?.error) {
        logError('[useContextAttachments] Folder picker failed:', result.error);
      }
    } catch (error) {
      logError('[useContextAttachments] Folder picker error:', error);
    }
  }, [addFile]);

  return {
    attachedFiles,
    addFile,
    removeFile,
    clearFiles,
    openFilePicker,
    openFolderPicker,
  };
}
