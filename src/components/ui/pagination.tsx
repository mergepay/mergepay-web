"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export interface PaginationProps {
  currentPage: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  totalItems?: number;
  pageSize?: number;
  className?: string;
  disabled?: boolean;
}

export function Pagination({
  currentPage,
  totalPages,
  onPageChange,
  totalItems,
  pageSize,
  className,
  disabled = false,
}: PaginationProps) {
  if (totalPages <= 1) return null;

  const hasPrev = currentPage > 1;
  const hasNext = currentPage < totalPages;

  return (
    <div
      className={cn(
        "flex flex-wrap items-center justify-between gap-3 rounded-2xl border-3 border-ink bg-paper p-3 shadow-brutal-sm",
        className
      )}
      aria-label="Pagination Navigation"
    >
      <div className="text-xs font-bold text-ink/70">
        {totalItems !== undefined && pageSize !== undefined ? (
          <span>
            Showing{" "}
            <span className="font-mono text-ink">
              {Math.min((currentPage - 1) * pageSize + 1, totalItems)}
            </span>
            -
            <span className="font-mono text-ink">
              {Math.min(currentPage * pageSize, totalItems)}
            </span>{" "}
            of <span className="font-mono text-ink">{totalItems}</span>
          </span>
        ) : (
          <span>
            Page <span className="font-mono text-ink">{currentPage}</span> of{" "}
            <span className="font-mono text-ink">{totalPages}</span>
          </span>
        )}
      </div>

      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={() => onPageChange(currentPage - 1)}
          disabled={!hasPrev || disabled}
          aria-label="Go to previous page"
        >
          <ChevronLeft className="h-4 w-4" /> Prev
        </Button>

        <span className="px-2 font-display text-xs uppercase tracking-wide">
          {currentPage} / {totalPages}
        </span>

        <Button
          variant="outline"
          size="sm"
          onClick={() => onPageChange(currentPage + 1)}
          disabled={!hasNext || disabled}
          aria-label="Go to next page"
        >
          Next <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
