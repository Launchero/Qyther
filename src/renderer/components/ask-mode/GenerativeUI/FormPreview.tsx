/* eslint-disable @typescript-eslint/no-explicit-any -- Form data shapes are dynamic */
﻿import React, { useState } from 'react';
import { LinkIcon, CheckIcon } from '@phosphor-icons/react';
import { Button } from '@/components/ui/button';

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
            id={field.name}
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
            id={field.name}
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
            id={field.name}
            type="checkbox"
            checked={Boolean(value)}
            onChange={(e) => handleChange(field.name, e.target.checked)}
            className="form-field-checkbox"
          />
        );
      
      default:
        return (
          <input
            id={field.name}
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
          <LinkIcon aria-hidden="true" />
          <span>{targetUrl}</span>
        </div>
      )}
      
      <div className="form-fields">
        {formData.map(field => (
          <div key={field.name} className="form-field-group">
            <label className="form-field-label" htmlFor={field.name}>
              {field.label}
              {field.required && <span className="required">*</span>}
            </label>
            {renderField(field)}
          </div>
        ))}
      </div>
      
      <div className="form-actions">
        {onCancel && (
          <Button type="button" variant="outline" size="sm" onClick={onCancel}>
            Cancel
          </Button>
        )}
        {onConfirm && (
          <Button type="button" size="sm" onClick={handleSubmit}>
            <CheckIcon aria-hidden="true" />
            Submit Form
          </Button>
        )}
      </div>
    </div>
  );
}
