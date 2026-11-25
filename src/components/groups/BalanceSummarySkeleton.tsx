import React from "react";
import { Card, CardContent } from "../ui/card";
import { Skeleton } from "../ui/skeleton";

export interface BalanceSummarySkeletonProps {
  className?: string;
}

export function BalanceSummarySkeleton({ className = "" }: BalanceSummarySkeletonProps) {
  return (
    <Card className={`bg-cream border-3 border-ink rounded-2xl shadow-brutal ${className}`} data-testid="balance-summary-skeleton">
      <div className="flex items-center justify-between border-b-3 border-ink bg-aqua px-4 py-3">
        <Skeleton className="h-5 w-36 bg-ink/20 border-2 border-ink" />
        <Skeleton className="h-5 w-16 bg-ink/20 border-2 border-ink rounded-lg" />
      </div>
      <CardContent className="p-4 space-y-3">
        <div className="flex items-center justify-between py-2 border-b-2 border-ink/10">
          <div className="flex items-center gap-2">
            <Skeleton className="h-8 w-8 rounded-full border-2 border-ink bg-ink/10" />
            <div className="space-y-1">
              <Skeleton className="h-4 w-24 bg-ink/10" />
              <Skeleton className="h-3 w-16 bg-ink/10" />
            </div>
          </div>
          <Skeleton className="h-5 w-20 bg-ink/10 border-2 border-ink rounded" />
        </div>
        <div className="flex items-center justify-between py-2">
          <div className="flex items-center gap-2">
            <Skeleton className="h-8 w-8 rounded-full border-2 border-ink bg-ink/10" />
            <div className="space-y-1">
              <Skeleton className="h-4 w-28 bg-ink/10" />
              <Skeleton className="h-3 w-12 bg-ink/10" />
            </div>
          </div>
          <Skeleton className="h-5 w-20 bg-ink/10 border-2 border-ink rounded" />
        </div>
      </CardContent>
    </Card>
  );
}
