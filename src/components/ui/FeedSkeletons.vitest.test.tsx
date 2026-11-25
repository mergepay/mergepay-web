import React from "react";
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import {
  ExpenseListSkeleton,
  BalanceListSkeleton,
  GroupCardSkeleton,
  SkeletonBoundary,
} from "./skeleton";

describe("Feed loading skeleton states (#634)", () => {
  it("renders the requested number of expense feed skeleton cards", () => {
    const { container } = render(<ExpenseListSkeleton rows={4} />);
    expect(container.firstElementChild?.children.length).toBe(4);
  });

  it("renders balance dashboard skeleton rows and group card placeholder", () => {
    const { container } = render(
      <div>
        <BalanceListSkeleton rows={3} />
        <GroupCardSkeleton className="test-group-skeleton" />
      </div>
    );
    expect(container.querySelector(".test-group-skeleton")).not.toBeNull();
  });

  it("displays skeleton while pending and transitions to resolved feed content", () => {
    const { rerender } = render(
      <SkeletonBoundary
        isPending={true}
        skeleton={<div data-testid="feed-skeleton">Loading activity...</div>}
      >
        <div data-testid="feed-content">Settled 50 USDC</div>
      </SkeletonBoundary>
    );

    expect(screen.getByTestId("feed-skeleton")).toBeInTheDocument();
    expect(screen.queryByTestId("feed-content")).toBeNull();

    rerender(
      <SkeletonBoundary
        isPending={false}
        skeleton={<div data-testid="feed-skeleton">Loading activity...</div>}
      >
        <div data-testid="feed-content">Settled 50 USDC</div>
      </SkeletonBoundary>
    );

    expect(screen.getByTestId("feed-content")).toBeInTheDocument();
    expect(screen.queryByTestId("feed-skeleton")).toBeNull();
  });
});
