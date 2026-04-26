import React from 'react';
import type { GenerativeUIType } from './index';

interface GenerativeUISkeletonProps {
  estimatedType?: GenerativeUIType;
  title?: string;
}

function TableSkeleton() {
  return (
    <div className="skeleton-table">
      <div className="skeleton-row shimmer" />
      <div className="skeleton-row shimmer" />
      <div className="skeleton-row shimmer" />
      <div className="skeleton-row shimmer" />
      <div className="skeleton-row shimmer" />
    </div>
  );
}

function FormSkeleton() {
  return (
    <div className="skeleton-form">
      <div className="skeleton-form-field">
        <div className="skeleton-label shimmer" />
        <div className="skeleton-input shimmer" />
      </div>
      <div className="skeleton-form-field">
        <div className="skeleton-label shimmer" />
        <div className="skeleton-input shimmer" />
      </div>
      <div className="skeleton-form-field">
        <div className="skeleton-label shimmer" />
        <div className="skeleton-input shimmer" />
      </div>
    </div>
  );
}

function ComparisonSkeleton() {
  return (
    <div className="skeleton-comparison">
      <div className="skeleton-row shimmer" />
      <div className="skeleton-row shimmer" />
      <div className="skeleton-row shimmer" />
    </div>
  );
}

function ListSkeleton() {
  return (
    <div className="skeleton-list">
      <div className="skeleton-list-item shimmer" />
      <div className="skeleton-list-item shimmer" />
      <div className="skeleton-list-item shimmer" />
      <div className="skeleton-list-item shimmer" />
    </div>
  );
}

function ChartSkeleton() {
  return (
    <div className="skeleton-chart">
      <div className="skeleton-chart-area shimmer" />
    </div>
  );
}

function DefaultSkeleton() {
  return (
    <div className="skeleton-default">
      <div className="skeleton-line shimmer" />
      <div className="skeleton-line shimmer" />
      <div className="skeleton-line shimmer" />
    </div>
  );
}

const SKELETON_VARIANTS: Record<string, React.FC> = {
  table: TableSkeleton,
  form: FormSkeleton,
  comparison: ComparisonSkeleton,
  list: ListSkeleton,
  chart: ChartSkeleton,
};

export function GenerativeUISkeleton({ estimatedType, title }: GenerativeUISkeletonProps) {
  const SkeletonContent = SKELETON_VARIANTS[estimatedType || 'table'] || DefaultSkeleton;

  return (
    <div className="generative-ui-container generative-ui-skeleton">
      {title && <div className="skeleton-header shimmer" />}
      <SkeletonContent />
      <div className="skeleton-footer shimmer" />
    </div>
  );
}
