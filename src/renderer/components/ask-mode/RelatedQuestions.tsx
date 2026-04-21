import React from 'react';
import { ArrowRightIcon } from '@phosphor-icons/react';
import { cn } from '@/lib/utils';

interface RelatedQuestionsProps {
  questions: string[];
  onSelect: (question: string) => void;
  className?: string;
}

export function RelatedQuestions({ questions, onSelect, className }: RelatedQuestionsProps) {
  if (questions.length === 0) return null;

  return (
    <div className={cn('related-questions', className)}>
      <div className="related-title">Related</div>
      <div className="related-list" role="list">
        {questions.map((question, index) => (
          <button
            key={index}
            className="related-item"
            onClick={() => onSelect(question)}
            role="listitem"
            aria-label={`Ask: ${question}`}
          >
            <ArrowRightIcon weight="regular" />
            {question}
          </button>
        ))}
      </div>
    </div>
  );
}
