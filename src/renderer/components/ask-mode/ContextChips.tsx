import React from 'react';
import { FileIcon, FolderIcon } from '@phosphor-icons/react';
import { cn } from '@/lib/utils';

export type ContextType = 'file' | 'folder';

export interface ContextChipData {
  type: ContextType;
  label: string;
  icon: React.ReactNode;
}

const chipConfigs: Record<ContextType, Omit<ContextChipData, 'label'>> = {
  file: {
    type: 'file',
    icon: <FileIcon weight="regular" />,
  },
  folder: {
    type: 'folder',
    icon: <FolderIcon weight="regular" />,
  },
};

interface ContextChipsProps {
  onChipSelect: (type: ContextType) => void;
  className?: string;
}

export function ContextChips({ onChipSelect, className }: ContextChipsProps) {
  return (
    <div className={cn('context-chips', className)}>
      {(Object.keys(chipConfigs) as ContextType[]).map((type) => {
        const config = chipConfigs[type];
        return (
          <button
            key={type}
            className="context-chip"
            onClick={() => onChipSelect(type)}
            aria-label={`Add ${type} context`}
          >
            {config.icon}
            @{type}
          </button>
        );
      })}
    </div>
  );
}
