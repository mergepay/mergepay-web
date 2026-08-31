import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';

export interface EmptyStateProps {
  /** Icon rendered above the title */
  icon?: React.ReactNode;
  /** Main heading for the empty state */
  title: string;
  /** Descriptive text explaining the empty state */
  description?: string;
  /** Optional call-to-action button or action elements */
  action?: React.ReactNode;
  /** Additional CSS classes */
  className?: string;
  /** Accessible label for screen readers */
  'aria-label'?: string;
}

/**
 * Neobrutalist EmptyState component for empty lists and dashboard views.
 * Features bold black borders (border-2 border-black or border-3 border-ink), solid shadow offsets, and vibrant backgrounds.
 */
export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
  'aria-label': ariaLabel,
}: EmptyStateProps) {
  return (
    <Card
      className={cn(
        'border-3 border-ink bg-paper p-8 text-center shadow-brutal',
        className
      )}
      aria-label={ariaLabel}
    >
      <CardContent className="flex flex-col items-center justify-center space-y-4 pt-6">
        {icon && (
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl border-3 border-ink bg-butter shadow-brutal-sm">
            {icon}
          </div>
        )}
        <div className="space-y-1 max-w-sm">
          <h3 className="font-display text-lg uppercase tracking-tight text-ink">
            {title}
          </h3>
          {description && (
            <p className="text-sm text-ink/70 leading-relaxed">
              {description}
            </p>
          )}
        </div>
        {action && <div className="pt-2">{action}</div>}
      </CardContent>
    </Card>
  );
}
