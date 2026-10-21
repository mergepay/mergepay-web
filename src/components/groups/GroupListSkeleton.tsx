import React from "react";
import { Card, CardContent } from "../ui/card";
import { Skeleton } from "../ui/skeleton";

export interface GroupListSkeletonProps {
  count?: number;
  className?: string;
}

export function GroupListSkeleton({ count = 3, className = "" }: GroupListSkeletonProps) {
  return (
    <div className={`grid gap-4 sm:grid-cols-2 lg:grid-cols-3 ${className}`} data-testid="group-list-skeleton">
      {Array.from({ length: count }).map((_, i) => (
        <Card key={i} className="bg-cream border-3 border-ink rounded-2xl shadow-brutal p-5 space-y-4">
          <div className="flex items-center justify-between">
            <Skeleton className="h-6 w-32 bg-ink/10 border-2 border-ink" />
            <Skeleton className="h-5 w-16 bg-ink/10 border-2 border-ink rounded-lg" />
          </div>
          <Skeleton className="h-4 w-full bg-ink/10 rounded" />
          <Skeleton className="h-4 w-2/3 bg-ink/10 rounded" />
          <div className="flex items-center justify-between pt-2 border-t-2 border-ink/20">
            <Skeleton className="h-8 w-24 bg-ink/10 border-2 border-ink rounded-lg" />
            <Skeleton className="h-8 w-20 bg-ink/10 border-2 border-ink rounded-lg" />
          </div>
        </Card>
      ))}
    </div>
  );
}
