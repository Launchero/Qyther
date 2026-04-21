import React from 'react';
import { DataTable, TableData, TableColumn } from './DataTable';
import { FormPreview, FormField } from './FormPreview';
import { ComparisonTable, ComparisonItem, ComparisonCriteria } from './ComparisonTable';
import { GenerativeUISkeleton } from './GenerativeUISkeleton';
import { GenerativeUIProgress } from './GenerativeUIProgress';

export type GenerativeUIType = 'table' | 'form' | 'comparison' | 'list';

interface GenerativeUIProps {
  resultType: GenerativeUIType;
  data: any;
  title?: string;
  onExport?: (format: 'csv' | 'json' | 'md') => void;
  onConfirm?: (data: any) => void;
  onEdit?: (field: string, value: any) => void;
  onCancel?: () => void;
}

export function GenerativeUI({ resultType, data, title, onExport, onConfirm, onEdit, onCancel }: GenerativeUIProps) {
  switch (resultType) {
    case 'table': {
      const tableData = data as TableData;
      return (
        <DataTable
          data={tableData}
          title={title}
          onExport={onExport}
        />
      );
    }
    
    case 'form': {
      const formFields = data as FormField[];
      return (
        <FormPreview
          formData={formFields}
          title={title}
          onConfirm={onConfirm}
          onEdit={onEdit}
          onCancel={onCancel}
        />
      );
    }
    
    case 'comparison': {
      const comparisonData = {
        items: data.items as ComparisonItem[],
        criteria: data.criteria as ComparisonCriteria[],
      };
      return (
        <ComparisonTable
          items={comparisonData.items}
          criteria={comparisonData.criteria}
          title={data.title || title}
          onExport={onExport}
        />
      );
    }
    
    case 'list': {
      // Simple list rendering
      return (
        <div className="generative-ui-container generative-list">
          {title && <h3 className="generative-ui-title">{title}</h3>}
          <ul className="generative-list-items">
            {Array.isArray(data) ? (
              data.map((item, index) => (
                <li key={index} className="generative-list-item">
                  {typeof item === 'string' ? item : JSON.stringify(item)}
                </li>
              ))
            ) : (
              <li>No data available</li>
            )}
          </ul>
        </div>
      );
    }
    
    default:
      return (
        <div className="generative-ui-fallback">
          <p>Unsupported data type: {resultType}</p>
          <pre>{JSON.stringify(data, null, 2)}</pre>
        </div>
      );
  }
}

export { DataTable, FormPreview, ComparisonTable, GenerativeUISkeleton, GenerativeUIProgress };
export type { TableData, TableColumn, FormField, ComparisonItem, ComparisonCriteria };
