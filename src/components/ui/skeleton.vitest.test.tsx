import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import {
  BalanceCardSkeleton,
  ExpenseCardSkeleton,
  GroupCardSkeleton,
  GroupHeaderSkeleton,
  ListSkeleton,
  Skeleton,
  SkeletonAvatar,
  SkeletonBadge,
  SkeletonBoundary,
  SkeletonText,
} from "./skeleton";

vi.mock("framer-motion", async (importOriginal) => {
  const actual = await importOriginal<typeof import("framer-motion")>();
  return {
    ...actual,
    // `useReducedMotion` reads matchMedia, which jsdom does not implement.
    useReducedMotion: () => false,
  };
});

describe("Skeleton", () => {
  it("matches the neobrutalist placeholder styling", () => {
    render(<Skeleton className="h-4 w-20" data-testid="sk" />);
    const el = screen.getByTestId("sk");
    expect(el.className).toContain("rounded-xl");
    expect(el.className).toContain("border-2");
    // The pulse must be opt-out for reduced-motion users.
    expect(el.className).toContain("motion-safe:animate-pulse");
  });
});

describe("Skeleton composition primitives", () => {
  it("renders the requested number of text lines", () => {
    const { container } = render(<SkeletonText lines={3} />);
    const lines = container.querySelectorAll(".motion-safe\\:animate-pulse");
    expect(lines.length).toBe(3);
  });

  it("applies the size variant to avatars", () => {
    const { container } = render(<SkeletonAvatar size="lg" />);
    const avatar = container.firstElementChild as HTMLElement;
    expect(avatar.className).toContain("h-14");
    expect(avatar.className).toContain("w-14");
    expect(avatar.className).toContain("rounded-full");
  });

  it("renders a badge placeholder", () => {
    const { container } = render(<SkeletonBadge />);
    expect((container.firstElementChild as HTMLElement).className).toContain("w-20");
  });
});

describe("Domain skeletons", () => {
  it("renders the expense card structure", () => {
    const { container } = render(<ExpenseCardSkeleton />);
    expect(container.firstElementChild?.className).toContain("shadow-brutal");
    // Avatar + amount + share rows, so the placeholder occupies roughly the
    // same space the real card will.
    expect(container.querySelectorAll(".rounded-full").length).toBeGreaterThan(1);
  });

  it("renders the balance card structure", () => {
    const { container } = render(<BalanceCardSkeleton />);
    expect(container.firstElementChild?.className).toContain("border-3");
  });

  it("renders the group header structure", () => {
    const { container } = render(<GroupHeaderSkeleton />);
    expect(container.firstElementChild?.className).toContain("p-6");
  });

  it("renders the group card structure", () => {
    const { container } = render(<GroupCardSkeleton />);
    expect(container.firstElementChild?.className).toContain("h-full");
  });

  it("renders the requested number of rows per variant", () => {
    const card = render(<ListSkeleton rows={4} />);
    expect(card.container.querySelectorAll(".shadow-brutal").length).toBe(4);

    const expense = render(<ListSkeleton rows={3} variant="expense" />);
    expect(expense.container.querySelectorAll(".overflow-hidden").length).toBe(3);
  });
});

describe("SkeletonBoundary", () => {
  it("renders only the skeleton while pending", () => {
    render(
      <SkeletonBoundary isPending skeleton={<div>loading…</div>}>
        <div>real content</div>
      </SkeletonBoundary>
    );

    expect(screen.getByText("loading…")).toBeInTheDocument();
    // Live content must not sit in the tree underneath a placeholder —
    // otherwise a user can click rows that are about to be replaced.
    expect(screen.queryByText("real content")).toBeNull();
  });

  it("renders the content once resolved", () => {
    render(
      <SkeletonBoundary isPending={false} skeleton={<div>loading…</div>}>
        <div>real content</div>
      </SkeletonBoundary>
    );

    expect(screen.getByText("real content")).toBeInTheDocument();
    expect(screen.queryByText("loading…")).toBeNull();
  });

  it("swaps skeleton for content on resolve", () => {
    const { rerender } = render(
      <SkeletonBoundary isPending skeleton={<div>loading…</div>}>
        <div>real content</div>
      </SkeletonBoundary>
    );
    expect(screen.queryByText("real content")).toBeNull();

    rerender(
      <SkeletonBoundary isPending={false} skeleton={<div>loading…</div>}>
        <div>real content</div>
      </SkeletonBoundary>
    );
    expect(screen.getByText("real content")).toBeInTheDocument();
  });

  it("animates only opacity so nothing reflows mid-transition", () => {
    render(
      <SkeletonBoundary
        isPending={false}
        durationMs={320}
        skeleton={<div>loading…</div>}
      >
        <div>real content</div>
      </SkeletonBoundary>
    );

    const wrapper = screen.getByText("real content").parentElement as HTMLElement;
    expect(wrapper.style.opacity).not.toBe("");
    // No transform is applied, so the resolved layout is already final.
    expect(wrapper.style.transform).toBe("");
  });
});
