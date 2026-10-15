import React from 'react';
import { ArrowRightIcon } from '@phosphor-icons/react';
import { Button } from '@/components/ui/button';
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
        {questions.map((question) => (
          <Button
            key={question}
            type="button"
            variant="ghost"
            size="xs"
            // `.related-question-item` is the CSS stagger hook — it must stay on the element.
            className="related-question-item related-item justify-start"
            onClick={() => onSelect(question)}
            role="listitem"
            aria-label={`Ask: ${question}`}
            title={`Ask: ${question}`}
          >
            <ArrowRightIcon weight="regular" aria-hidden="true" />
            {question}
          </Button>
        ))}
      </div>
    </div>
  );
}
