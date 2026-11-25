import { render, screen, fireEvent } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { Pagination } from "./pagination";

describe("Pagination Component", () => {
  it("renders pagination controls with correct page information", () => {
    const onPageChange = vi.fn();
    render(
      <Pagination
        currentPage={2}
        totalPages={5}
        onPageChange={onPageChange}
        totalItems={50}
        pageSize={10}
      />
    );

    expect(screen.getByText(/showing/i)).toBeInTheDocument();
    expect(screen.getByText("11")).toBeInTheDocument();
    expect(screen.getByText("20")).toBeInTheDocument();
    expect(screen.getByText("50")).toBeInTheDocument();
    expect(screen.getByText("2 / 5")).toBeInTheDocument();
  });

  it("calls onPageChange when Prev and Next buttons are clicked", () => {
    const onPageChange = vi.fn();
    render(
      <Pagination
        currentPage={2}
        totalPages={5}
        onPageChange={onPageChange}
      />
    );

    const prevButton = screen.getByRole("button", { name: /previous page/i });
    const nextButton = screen.getByRole("button", { name: /next page/i });

    fireEvent.click(prevButton);
    expect(onPageChange).toHaveBeenLastCalledWith(1);

    fireEvent.click(nextButton);
    expect(onPageChange).toHaveBeenLastCalledWith(3);
  });

  it("disables Prev button on first page and Next button on last page", () => {
    const { rerender } = render(
      <Pagination
        currentPage={1}
        totalPages={3}
        onPageChange={() => {}}
      />
    );

    expect(screen.getByRole("button", { name: /previous page/i })).toBeDisabled();
    expect(screen.getByRole("button", { name: /next page/i })).not.toBeDisabled();

    rerender(
      <Pagination
        currentPage={3}
        totalPages={3}
        onPageChange={() => {}}
      />
    );

    expect(screen.getByRole("button", { name: /previous page/i })).not.toBeDisabled();
    expect(screen.getByRole("button", { name: /next page/i })).toBeDisabled();
  });

  it("does not render when totalPages is 1 or 0", () => {
    const { container } = render(
      <Pagination
        currentPage={1}
        totalPages={1}
        onPageChange={() => {}}
      />
    );
    expect(container.firstChild).toBeNull();
  });
});
