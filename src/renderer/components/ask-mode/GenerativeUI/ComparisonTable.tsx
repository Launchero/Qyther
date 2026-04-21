import React, { useMemo, useCallback } from 'react';
import { DownloadSimpleIcon, CodeIcon, FileIcon } from '@phosphor-icons/react';

export interface ComparisonItem {
  name: string;
  icon?: React.ReactNode;
  attributes: Record<string, string | number | React.ReactNode>;
}

export interface ComparisonCriteria {
  key: string;
  label: string;
  type?: 'number' | 'text' | 'boolean';
  highlight?: 'best' | 'worst';
}

interface ComparisonTableProps {
  items: ComparisonItem[];
  criteria: ComparisonCriteria[];
  title?: string;
  onExport?: (format: 'csv' | 'json' | 'md') => void;
}

function detectNumericColumns(criteria: ComparisonCriteria[], items: ComparisonItem[]): Set<string> {
  const numericKeys = new Set<string>();
  for (const c of criteria) {
    const allValues = items.map(i => i.attributes[c.key]).filter(v => v !== undefined && v !== null);
    if (allValues.length > 0 && allValues.every(v => typeof v === 'number' || (typeof v === 'string' && /^\d+(\.\d+)?$/.test(v)))) {
      numericKeys.add(c.key);
    }
  }
  return numericKeys;
}

export function ComparisonTable({ items, criteria, title, onExport }: ComparisonTableProps) {
  const safeItems = useMemo(() => items.map(item => {
    if (Array.isArray(item.attributes)) {
      const record: Record<string, string | number | React.ReactNode> = {};
      for (const a of item.attributes as Array<{ key: string; value: any }>) {
        record[a.key] = a.value;
      }
      return { ...item, attributes: record };
    }
    return item;
  }), [items]);

  const numericColumns = useMemo(() => detectNumericColumns(criteria, safeItems), [criteria, safeItems]);

  const enrichedCriteria = useMemo(() => criteria.map(c => ({
    ...c,
    type: c.type || (numericColumns.has(c.key) ? 'number' as const : 'text' as const),
    highlight: c.highlight ?? 'best' as const,
  })), [criteria, numericColumns]);

  const handleExport = useCallback((format: 'csv' | 'json' | 'md') => {
    if (!onExport) return;

    let content = '';
    if (format === 'csv') {
      const headers = ['Item', ...enrichedCriteria.map(c => c.label)].join(',');
      const rows = safeItems.map(item =>
        [item.name, ...enrichedCriteria.map(c => String(item.attributes[c.key] || ''))].join(',')
      ).join('\n');
      content = `${headers}\n${rows}`;
    } else if (format === 'json') {
      content = JSON.stringify(safeItems, null, 2);
    } else if (format === 'md') {
      const header = `| ${['Item', ...enrichedCriteria.map(c => c.label)].join(' | ')} |`;
      const separator = `| ${['---', ...enrichedCriteria.map(() => '---')].join(' | ')} |`;
      const rows = safeItems.map(item =>
        `| ${[item.name, ...enrichedCriteria.map(c => String(item.attributes[c.key] || ''))].join(' | ')} |`
      ).join('\n');
      content = `${header}\n${separator}\n${rows}`;
    }

    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `comparison-export.${format}`;
    a.click();
    URL.revokeObjectURL(url);

    onExport(format);
  }, [onExport, enrichedCriteria, safeItems]);

  const getBestValue = (criteriaKey: string, type: 'number' | 'text' | 'boolean') => {
    const values = safeItems.map(item => item.attributes[criteriaKey]);
    if (type === 'number') {
      const numValues = values.map(v => Number(v) || 0);
      return Math.max(...numValues);
    }
    return null;
  };

  const isBestValue = (crit: ComparisonCriteria, value: any) => {
    if (crit.type === 'number') {
      const best = getBestValue(crit.key, 'number');
      return Number(value) === best;
    }
    return false;
  };

  const hasAnyHighlight = useMemo(() => enrichedCriteria.some(c => c.type === 'number'), [enrichedCriteria]);

  const renderValue = (crit: ComparisonCriteria, value: any) => {
    const isBest = isBestValue(crit, value);
    return (
      <span className={`comparison-value ${isBest ? 'highlighted' : ''}`}>
        {value}
        {isBest && crit.highlight === 'best' && (
          <span className="best-badge">Best</span>
        )}
      </span>
    );
  };

  return (
    <div className="generative-ui-container">
      {title && <h3 className="generative-ui-title">{title}</h3>}

      {onExport && (
        <div className="comparison-controls">
          <div className="export-buttons">
            <button onClick={() => handleExport('csv')} className="export-btn" title="Export as CSV">
              <DownloadSimpleIcon weight="bold" />
              CSV
            </button>
            <button onClick={() => handleExport('json')} className="export-btn" title="Export as JSON">
              <CodeIcon weight="bold" />
              JSON
            </button>
            <button onClick={() => handleExport('md')} className="export-btn" title="Export as Markdown">
              <FileIcon weight="bold" />
              MD
            </button>
          </div>
        </div>
      )}

      <div className="comparison-table-wrapper">
        <table className="comparison-table">
          <thead>
            <tr>
              <th className="comparison-header-item">Item</th>
              {enrichedCriteria.map(c => (
                <th key={c.key} className="comparison-header-criteria">
                  {c.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {safeItems.map((item, index) => (
              <tr key={index} className={`comparison-row ${index % 2 === 1 ? 'comparison-row-alt' : ''}`}>
                <td className="comparison-item-name">
                  {item.icon && <span className="comparison-item-icon">{item.icon}</span>}
                  <span className="comparison-item-label">{item.name}</span>
                </td>
                {enrichedCriteria.map(c => (
                  <td key={c.key} className="comparison-cell">
                    {renderValue(c, item.attributes[c.key])}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {hasAnyHighlight && (
        <div className="comparison-footer">
          <span className="comparison-legend">
            <span className="legend-item">
              <span className="legend-badge highlighted">Best value</span>
            </span>
          </span>
        </div>
      )}
    </div>
  );
}
