import { cn } from "@/lib/utils";

export function Skeleton({ className, ...props }: { className?: string } & React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      {...props}
      className={cn(
        "animate-pulse rounded-xl border-2 border-ink/10 bg-ink/10",
        className
      )}
    />
  );
}

export function SkeletonText({ lines = 1, className, ...props }: { lines?: number; className?: string } & React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div {...props} className={cn("space-y-2", className)}>
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton key={i} className="h-4 w-full" />
      ))}
    </div>
  );
}

export function SkeletonAvatar({ className, size = "md", ...props }: { className?: string; size?: "sm" | "md" | "lg" } & React.HTMLAttributes<HTMLDivElement>) {
  const sizeClasses = {
    sm: "h-7 w-7",
    md: "h-10 w-10",
    lg: "h-14 w-14",
  };
  return (
    <Skeleton
      {...props}
      className={cn(sizeClasses[size], "rounded-full", className)}
    />
  );
}

export function SkeletonBadge({ className, ...props }: { className?: string } & React.HTMLAttributes<HTMLDivElement>) {
  return (
    <Skeleton
      {...props}
      className={cn("h-5 w-20 rounded-lg", className)}
    />
  );
}

export function SkeletonButton({ className, ...props }: { className?: string } & React.HTMLAttributes<HTMLDivElement>) {
  return (
    <Skeleton
      {...props}
      className={cn("h-9 w-24 rounded-lg", className)}
    />
  );
}

export function CardSkeleton({ className }: { className?: string }) {
  return (
    <div className={cn("bg-cream border-3 border-ink rounded-2xl shadow-brutal p-5 space-y-3", className)}>
      <Skeleton className="h-5 w-1/3" />
      <Skeleton className="h-4 w-2/3" />
      <Skeleton className="h-4 w-1/2" />
    </div>
  );
}

export function ExpenseCardSkeleton({ className }: { className?: string }) {
  return (
    <div className={cn("bg-cream border-3 border-ink rounded-2xl shadow-brutal overflow-hidden", className)}>
      <div className="p-4">
        <div className="flex items-center gap-3">
          <SkeletonAvatar size="md" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-5 w-1/3" />
            <Skeleton className="h-3 w-1/2" />
          </div>
          <div className="text-right space-y-2">
            <Skeleton className="h-6 w-24" />
            <Skeleton className="h-3 w-16" />
          </div>
        </div>
      </div>
      <div className="border-t-3 border-ink bg-paper px-4 py-3 space-y-2">
        <SkeletonText lines={2} className="max-w-md" />
        <div className="space-y-1.5">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="flex items-center justify-between rounded-lg border-2 border-ink bg-white px-3 py-1.5">
              <div className="flex items-center gap-2">
                <SkeletonAvatar size="sm" />
                <Skeleton className="h-4 w-24" />
              </div>
              <div className="flex items-center gap-2">
                <Skeleton className="h-4 w-20" />
                <SkeletonBadge />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export function BalanceCardSkeleton({ className }: { className?: string }) {
  return (
    <div className={cn("bg-cream border-3 border-ink rounded-2xl shadow-brutal p-3 flex items-center justify-between", className)}>
      <div className="flex items-center gap-2">
        <SkeletonAvatar size="sm" />
        <Skeleton className="h-4 w-24" />
      </div>
      <div className="flex items-center gap-2">
        <Skeleton className="h-5 w-24" />
        <Skeleton className="h-4 w-16" />
      </div>
    </div>
  );
}

export function SettlementPathSkeleton({ className }: { className?: string }) {
  return (
    <div className={cn("bg-cream border-3 border-ink rounded-2xl shadow-brutal p-3", className)}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <SkeletonAvatar size="sm" />
          <Skeleton className="h-4 w-20" />
          <Skeleton className="h-4 w-4" />
          <SkeletonAvatar size="sm" />
          <Skeleton className="h-4 w-20" />
        </div>
        <div className="flex items-center gap-3">
          <Skeleton className="h-5 w-24" />
          <Skeleton className="h-4 w-16" />
          <SkeletonButton className="w-20" />
        </div>
      </div>
    </div>
  );
}

export function GroupHeaderSkeleton({ className }: { className?: string }) {
  return (
    <div className={cn("bg-cream border-3 border-ink rounded-2xl shadow-brutal p-6 space-y-2", className)}>
      <Skeleton className="h-8 w-1/2" />
      <Skeleton className="h-4 w-3/4" />
    </div>
  );
}

export function ListSkeleton({ rows = 3, variant = "card" }: { rows?: number; variant?: "card" | "expense" | "balance" | "settlement" }) {
  const Item = variant === "expense" ? ExpenseCardSkeleton : variant === "balance" ? BalanceCardSkeleton : variant === "settlement" ? SettlementPathSkeleton : CardSkeleton;
  return (
    <div className="space-y-3">
      {Array.from({ length: rows }).map((_, i) => (
        <Item key={i} />
      ))}
    </div>
  );
}

export function GroupCardSkeleton({ className }: { className?: string }) {
  return (
    <div className={cn("bg-cream border-3 border-ink rounded-2xl shadow-brutal h-full transition-all", className)}>
      <div className="p-5 flex flex-col justify-between h-full space-y-4">
        <div>
          <div className="flex items-center justify-between mb-3">
            <Skeleton className="flex h-10 w-10 items-center justify-center rounded-xl border-3 border-ink bg-ink/10" />
            <Skeleton className="h-3 w-20" />
          </div>
          <Skeleton className="h-6 w-1/2" />
          <Skeleton className="h-4 w-3/4" />
        </div>
        <div className="mt-4 pt-3 border-t-2 border-ink/10 flex items-center justify-between text-xs font-bold uppercase">
          <Skeleton className="h-4 w-20" />
          <Skeleton className="h-4 w-4" />
        </div>
      </div>
    </div>
  );
}
