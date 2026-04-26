import React from 'react';
import { DataTable, TableData, TableColumn } from './DataTable';
import { FormPreview, FormField } from './FormPreview';
import { ComparisonTable, ComparisonItem, ComparisonCriteria } from './ComparisonTable';
import { ChartView, ChartDataPoint } from './ChartView';
import { GenerativeUISkeleton } from './GenerativeUISkeleton';
import { GenerativeUIProgress } from './GenerativeUIProgress';

export type GenerativeUIType = 'table' | 'form' | 'comparison' | 'list' | 'chart';

interface GenerativeUIProps {
  resultType: GenerativeUIType;
  data: Record<string, unknown> | unknown[];
  title?: string;
  onExport?: (format: 'csv' | 'json' | 'md') => void;
  onConfirm?: (data: Record<string, unknown>) => void;
  onEdit?: (field: string, value: unknown) => void;
  onCancel?: () => void;
}

export function GenerativeUI({ resultType, data, title, onExport, onConfirm, onEdit, onCancel }: GenerativeUIProps) {
  switch (resultType) {
    case 'table': {
      return (
        <DataTable
          data={data as unknown as TableData}
          title={title}
          onExport={onExport}
        />
      );
    }

    case 'form': {
      return (
        <FormPreview
          formData={data as unknown as FormField[]}
          title={title}
          onConfirm={onConfirm}
          onEdit={onEdit}
          onCancel={onCancel}
        />
      );
    }

    case 'comparison': {
      const obj = data as Record<string, unknown>;
      return (
        <ComparisonTable
          items={obj.items as ComparisonItem[]}
          criteria={obj.criteria as ComparisonCriteria[]}
          title={(obj.title as string) || title}
          onExport={onExport}
        />
      );
    }

    case 'list': {
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

    case 'chart': {
      const obj = data as Record<string, unknown>;
      return (
        <ChartView
          chartType={obj.chartType as 'bar' | 'line' | 'area' | 'pie'}
          data={obj.data as ChartDataPoint[]}
          title={(obj.title as string) || title}
          description={obj.description as string}
          xKey={obj.xKey as string}
          yKey={obj.yKey as string}
        />
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

export { DataTable, FormPreview, ComparisonTable, ChartView, GenerativeUISkeleton, GenerativeUIProgress };
export type { TableData, TableColumn, FormField, ComparisonItem, ComparisonCriteria, ChartDataPoint };
