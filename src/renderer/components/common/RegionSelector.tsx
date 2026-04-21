import React, { useState, useRef, useCallback } from 'react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { X, Check } from '@phosphor-icons/react';
import { useFocusTrap } from '@/hooks/useFocusTrap';

export interface Region {
  x: number;
  y: number;
  w: number;
  h: number;
}

interface RegionSelectorProps {
  onConfirm: (region: Region) => void;
  onCancel: () => void;
  screenshot?: string;
}

export function RegionSelector({ onConfirm, onCancel, screenshot }: RegionSelectorProps) {
  const [isSelecting, setIsSelecting] = useState(false);
  const [startPos, setStartPos] = useState({ x: 0, y: 0 });
  const [currentPos, setCurrentPos] = useState({ x: 0, y: 0 });
  const [selection, setSelection] = useState<Region | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useFocusTrap(containerRef, {
    onEscape: onCancel,
    initialFocusSelector: '[data-cancel-button]',
  });

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    setIsSelecting(true);
    setStartPos({ x, y });
    setCurrentPos({ x, y });
  }, []);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!isSelecting || !containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    setCurrentPos({ x, y });
  }, [isSelecting]);

  const handleMouseUp = useCallback(() => {
    if (!isSelecting) return;
    setIsSelecting(false);

    const x = Math.min(startPos.x, currentPos.x);
    const y = Math.min(startPos.y, currentPos.y);
    const w = Math.abs(currentPos.x - startPos.x);
    const h = Math.abs(currentPos.y - startPos.y);

    if (w > 10 && h > 10) {
      setSelection({ x, y, w, h });
    }
  }, [isSelecting, startPos, currentPos]);

  const handleConfirm = useCallback(() => {
    if (selection && containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect();
      const scaleX = rect.width > 0 ? (rect.width / rect.width) : 1;
      const scaleY = rect.height > 0 ? (rect.height / rect.height) : 1;
      onConfirm({
        x: Math.round(selection.x / scaleX),
        y: Math.round(selection.y / scaleY),
        w: Math.round(selection.w / scaleX),
        h: Math.round(selection.h / scaleY),
      });
    }
  }, [selection, onConfirm]);

  const left = Math.min(startPos.x, currentPos.x);
  const top = Math.min(startPos.y, currentPos.y);
  const width = Math.abs(currentPos.x - startPos.x);
  const height = Math.abs(currentPos.y - startPos.y);

  return (
    <div
      ref={containerRef}
      tabIndex={-1}
      className={cn(
        'fixed inset-0 z-50 cursor-crosshair',
        'bg-background/80 backdrop-blur-sm'
      )}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      role="dialog"
      aria-label="Select screen region"
    >
      {/* Instructions */}
      <div className="fixed top-[var(--spacing-8)] left-1/2 -translate-x-1/2 z-60 flex items-center gap-[var(--spacing-4)]">
        <div className="flex items-center gap-[var(--spacing-2)] px-[var(--spacing-4)] py-[var(--spacing-2)] bg-card border border-border rounded-[var(--radius-lg)] shadow-[var(--shadow-lg)]">
          <span className="text-sm text-muted-foreground">
            Click and drag to select a region
          </span>
        </div>
        <div className="flex gap-[var(--spacing-2)]">
          {selection && (
            <Button
              variant="default"
              size="sm"
              className="h-[var(--spacing-8)]"
              onClick={handleConfirm}
            >
              <Check className="w-4 h-4 mr-[var(--spacing-1)]" />
              Confirm
            </Button>
          )}
          <Button
            variant="outline"
            size="sm"
            className="h-[var(--spacing-8)]"
            onClick={onCancel}
            data-cancel-button
          >
            <X className="w-4 h-4 mr-[var(--spacing-1)]" />
            Cancel
          </Button>
        </div>
      </div>

      {/* Screenshot preview if available */}
      {screenshot && (
        <div className="fixed inset-0 flex items-center justify-center pointer-events-none">
          <img
            src={screenshot}
            alt="Screen preview"
            className="max-w-[90%] max-h-[80vh] rounded-[var(--radius-lg)] shadow-[var(--shadow-2xl)] opacity-50"
          />
        </div>
      )}

      {/* Selection overlay */}
      {isSelecting && (
        <div
          className="absolute border-2 border-desktop-primary bg-desktop-primary/10"
          style={{
            left: `${left}px`,
            top: `${top}px`,
            width: `${width}px`,
            height: `${height}px`,
          }}
        />
      )}

      {/* Final selection */}
      {selection && !isSelecting && (
        <div
          className="absolute border-2 border-desktop-primary bg-desktop-primary/10"
          style={{
            left: `${selection.x}px`,
            top: `${selection.y}px`,
            width: `${selection.w}px`,
            height: `${selection.h}px`,
          }}
        >
          <div className="absolute -top-[var(--spacing-6)] left-0 px-2 py-1 bg-desktop-primary text-desktop-primary-foreground text-xs rounded-[var(--radius-sm)] whitespace-nowrap">
            {Math.round(selection.w)} × {Math.round(selection.h)}
          </div>
        </div>
      )}
    </div>
  );
}
