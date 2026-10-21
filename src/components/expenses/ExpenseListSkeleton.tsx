import React from "react";
import { Card } from "../ui/card";
import { Skeleton } from "../ui/skeleton";

export interface ExpenseListSkeletonProps {
  count?: number;
  className?: string;
}

export function ExpenseListSkeleton({ count = 4, className = "" }: ExpenseListSkeletonProps) {
  return (
    <div className={`space-y-3 ${className}`} data-testid="expense-list-skeleton">
      {Array.from({ length: count }).map((_, i) => (
        <Card key={i} className="bg-cream border-3 border-ink rounded-2xl shadow-brutal p-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Skeleton className="h-10 w-10 rounded-xl border-2 border-ink bg-ink/10" />
            <div className="space-y-1.5">
              <Skeleton className="h-4 w-36 bg-ink/10" />
              <Skeleton className="h-3 w-24 bg-ink/10" />
            </div>
          </div>
          <div className="flex flex-col items-end space-y-1">
            <Skeleton className="h-5 w-20 bg-ink/10 border-2 border-ink rounded" />
            <Skeleton className="h-3 w-14 bg-ink/10" />
          </div>
        </Card>
      ))}
    </div>
  );
}
