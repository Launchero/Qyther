import React, { useState } from 'react';
import { LinkIcon, CheckIcon } from '@phosphor-icons/react';

export interface FormField {
  name: string;
  label: string;
  type: 'text' | 'email' | 'number' | 'textarea' | 'select' | 'checkbox';
  value: string | number | boolean;
  options?: string[];
  required?: boolean;
}

interface FormPreviewProps {
  formData: FormField[];
  targetUrl?: string;
  title?: string;
  onConfirm?: (data: Record<string, any>) => void;
  onEdit?: (field: string, value: any) => void;
  onCancel?: () => void;
}

export function FormPreview({ formData, targetUrl, title, onConfirm, onEdit, onCancel }: FormPreviewProps) {
  const [localData, setLocalData] = useState<Record<string, any>>(
    formData.reduce((acc, field) => ({ ...acc, [field.name]: field.value }), {})
  );

  const handleChange = (fieldName: string, value: any) => {
    setLocalData(prev => ({ ...prev, [fieldName]: value }));
    onEdit?.(fieldName, value);
  };

  const handleSubmit = () => {
    onConfirm?.(localData);
  };

  const renderField = (field: FormField) => {
    const value = localData[field.name];

    switch (field.type) {
      case 'textarea':
        return (
          <textarea
            value={String(value)}
            onChange={(e) => handleChange(field.name, e.target.value)}
            className="form-field-input"
            rows={3}
            required={field.required}
          />
        );
      
      case 'select':
        return (
          <select
            value={String(value)}
            onChange={(e) => handleChange(field.name, e.target.value)}
            className="form-field-input"
            required={field.required}
          >
            <option value="">Select...</option>
            {field.options?.map(opt => (
              <option key={opt} value={opt}>{opt}</option>
            ))}
          </select>
        );
      
      case 'checkbox':
        return (
          <input
            type="checkbox"
            checked={Boolean(value)}
            onChange={(e) => handleChange(field.name, e.target.checked)}
            className="form-field-checkbox"
          />
        );
      
      default:
        return (
          <input
            type={field.type}
            value={String(value)}
            onChange={(e) => handleChange(field.name, field.type === 'number' ? Number(e.target.value) : e.target.value)}
            className="form-field-input"
            required={field.required}
          />
        );
    }
  };

  return (
    <div className="generative-ui-container form-preview-container">
      {title && <h3 className="generative-ui-title">{title}</h3>}
      
      {targetUrl && (
        <div className="form-target-url">
          <LinkIcon />
          <span>{targetUrl}</span>
        </div>
      )}
      
      <div className="form-fields">
        {formData.map(field => (
          <div key={field.name} className="form-field-group">
            <label className="form-field-label">
              {field.label}
              {field.required && <span className="required">*</span>}
            </label>
            {renderField(field)}
          </div>
        ))}
      </div>
      
      <div className="form-actions">
        {onCancel && (
          <button onClick={onCancel} className="form-btn-cancel">
            Cancel
          </button>
        )}
        {onConfirm && (
          <button onClick={handleSubmit} className="form-btn-confirm">
            <CheckIcon />
            Submit Form
          </button>
        )}
      </div>
    </div>
  );
}
