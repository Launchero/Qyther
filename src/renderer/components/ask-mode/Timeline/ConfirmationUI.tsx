import React from 'react';
import { WarningIcon, PencilSimpleIcon, CheckIcon } from '@phosphor-icons/react';

interface ConfirmationUIProps {
  title: string;
  details?: string;
  onConfirm: () => void;
  onEdit: () => void;
  onCancel: () => void;
}

export function ConfirmationUI({ title, details, onConfirm, onEdit, onCancel }: ConfirmationUIProps) {
  return (
    <div className="confirmation-ui">
      <div className="confirmation-header">
        <WarningIcon className="confirmation-icon w-5 h-5" />
        <h4 className="confirmation-title">Confirmation Required</h4>
      </div>

      <div className="confirmation-content">
        <p className="confirmation-main-text">{title}</p>
        {details && (
          <div className="confirmation-details">
            <pre className="confirmation-data">{details}</pre>
          </div>
        )}
      </div>

      <div className="confirmation-actions">
        <button onClick={onCancel} className="confirmation-btn-cancel">
          Cancel
        </button>
        <button onClick={onEdit} className="confirmation-btn-edit">
          <PencilSimpleIcon className="w-4 h-4" />
          Edit
        </button>
        <button onClick={onConfirm} className="confirmation-btn-confirm">
          <CheckIcon className="w-4 h-4" />
          Confirm
        </button>
      </div>
    </div>
  );
}
