import React, { useState } from 'react';
import { DownloadSimpleIcon, CodeIcon, FileIcon } from '@phosphor-icons/react';
import { Button } from '@/components/ui/button';

export interface TableColumn {
  key: string;
  label: string;
  align?: 'left' | 'center' | 'right';
}

export interface TableData {
  columns: TableColumn[];
  rows: Record<string, string | number | React.ReactNode>[];
}

interface DataTableProps {
  data: TableData;
  title?: string;
  onExport?: (format: 'csv' | 'json' | 'md') => void;
  onFilter?: (column: string, value: string) => void;
  onSort?: (column: string, direction: 'asc' | 'desc') => void;
}

export function DataTable({ data, title, onExport, onFilter, onSort }: DataTableProps) {
  const [sortColumn, setSortColumn] = useState<string | null>(null);
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');
  const [filterColumn, setFilterColumn] = useState<string | null>(null);
  const [filterValue, setFilterValue] = useState('');

  const handleSort = (column: string) => {
    const newDirection = sortColumn === column && sortDirection === 'asc' ? 'desc' : 'asc';
    setSortColumn(column);
    setSortDirection(newDirection);
    onSort?.(column, newDirection);
  };

  const handleFilterChange = (column: string, value: string) => {
    setFilterColumn(column);
    setFilterValue(value);
    onFilter?.(column, value);
  };

  const filteredRows = data.rows.filter(row => {
    if (!filterColumn || !filterValue) return true;
    const cellValue = String(row[filterColumn] || '');
    return cellValue.toLowerCase().includes(filterValue.toLowerCase());
  });

  const sortedRows = [...filteredRows].sort((a, b) => {
    if (!sortColumn) return 0;
    const aVal = a[sortColumn];
    const bVal = b[sortColumn];
    
    if (typeof aVal === 'number' && typeof bVal === 'number') {
      return sortDirection === 'asc' ? aVal - bVal : bVal - aVal;
    }
    
    const aStr = String(aVal);
    const bStr = String(bVal);
    return sortDirection === 'asc' 
      ? aStr.localeCompare(bStr)
      : bStr.localeCompare(aStr);
  });

  const handleExport = (format: 'csv' | 'json' | 'md') => {
    if (!onExport) return;
    
    let content = '';
    const filename = `table-export.${format}`;
    
    if (format === 'csv') {
      const headers = data.columns.map(col => col.label).join(',');
      const rows = sortedRows.map(row => 
        data.columns.map(col => String(row[col.key] || '')).join(',')
      ).join('\n');
      content = `${headers}\n${rows}`;
    } else if (format === 'json') {
      content = JSON.stringify(sortedRows, null, 2);
    } else if (format === 'md') {
      const header = data.columns.map(col => `| ${col.label} `).join('') + '|';
      const separator = data.columns.map(() => '| --- ').join('') + '|';
      const rows = sortedRows.map(row => 
        '| ' + data.columns.map(col => String(row[col.key] || '')).join(' | ') + ' |'
      ).join('\n');
      content = `${header}\n${separator}\n${rows}`;
    }
    
    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
    
    onExport(format);
  };

  return (
    <div className="generative-ui-container">
      {title && <h3 className="generative-ui-title">{title}</h3>}
      
      <div className="data-table-controls">
        {onExport && (
          <div className="export-buttons">
            <Button variant="outline" size="xs" onClick={() => handleExport('csv')} title="Export as CSV">
              <DownloadSimpleIcon aria-hidden="true" />
              CSV
            </Button>
            <Button variant="outline" size="xs" onClick={() => handleExport('json')} title="Export as JSON">
              <CodeIcon aria-hidden="true" />
              JSON
            </Button>
            <Button variant="outline" size="xs" onClick={() => handleExport('md')} title="Export as Markdown">
              <FileIcon aria-hidden="true" />
              MD
            </Button>
          </div>
        )}
        
        <div className="filter-input">
          <input
            type="text"
            aria-label="Filter table rows"
            placeholder={`Filter ${filterColumn || 'all columns'}...`}
            value={filterValue}
            onChange={(e) => handleFilterChange(filterColumn || data.columns[0]?.key || '', e.target.value)}
          />
          <select
            aria-label="Filter column"
            value={filterColumn || ''}
            onChange={(e) => setFilterColumn(e.target.value || null)}
            className="filter-column-select"
          >
            <option value="">All columns</option>
            {data.columns.map(col => (
              <option key={col.key} value={col.key}>{col.label}</option>
            ))}
          </select>
        </div>
      </div>
      
      <div className="data-table-wrapper">
        <table className="data-table">
          <thead>
            <tr>
              {data.columns.map(col => (
                <th
                  key={col.key}
                  scope="col"
                  className={`sortable ${sortColumn === col.key ? `sorted-${sortDirection}` : ''}`}
                  style={{ textAlign: col.align || 'left' }}
                  aria-sort={sortColumn === col.key ? (sortDirection === 'asc' ? 'ascending' : 'descending') : 'none'}
                >
                  {/* A click handler on <th> is unreachable by keyboard; the button
                      carries the interaction and the th keeps the sort semantics. */}
                  <button
                    type="button"
                    className="data-table-sort"
                    onClick={() => handleSort(col.key)}
                    aria-label={`Sort by ${col.label}`}
                  >
                    {col.label}
                    {sortColumn === col.key && (
                      <span className="sort-indicator" aria-hidden="true">
                        {sortDirection === 'asc' ? '↑' : '↓'}
                      </span>
                    )}
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sortedRows.map((row, rowIndex) => (
              <tr key={rowIndex}>
                {data.columns.map(col => (
                  <td key={`${rowIndex}-${col.key}`} style={{ textAlign: col.align || 'left' }}>
                    {typeof row[col.key] === 'string' ? String(row[col.key]) : row[col.key]}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      
      <div className="data-table-footer">
        <span className="row-count">
          {sortedRows.length} of {data.rows.length} rows
          {filterValue && ` (filtered by "${filterValue}")`}
        </span>
      </div>
    </div>
  );
}
