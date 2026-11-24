import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ParticipantPicker } from "./ParticipantPicker";
import type { GroupMember } from "@/lib/types";

function member(userId: string, displayName: string, key: string): GroupMember {
  return {
    id: `m-${userId}`,
    groupId: "g1",
    userId,
    role: "member",
    joinedAt: "2026-01-01T00:00:00Z",
    user: { id: userId, stellarPublicKey: key, displayName, avatarUrl: null, createdAt: "2026-01-01T00:00:00Z" },
  } as GroupMember;
}

const members = [
  member("1", "Alice", "GABC1111WXYZ"),
  member("2", "Bob", "GXYZ2222WXYZ"),
  member("3", "Carol", "GABD3333WXYZ"),
];

describe("ParticipantPicker", () => {
  it("filters options as the user types", () => {
    render(<ParticipantPicker members={members} selected={["1", "2", "3"]} onChange={vi.fn()} />);
    expect(screen.getAllByRole("checkbox")).toHaveLength(3);
    fireEvent.change(screen.getByLabelText("Split between"), { target: { value: "gab" } });
    expect(screen.getAllByRole("checkbox")).toHaveLength(2);
    expect(screen.queryByText("Bob")).not.toBeInTheDocument();
  });

  it("shows an empty state when nothing matches", () => {
    render(<ParticipantPicker members={members} selected={[]} onChange={vi.fn()} />);
    fireEvent.change(screen.getByLabelText("Split between"), { target: { value: "nobody" } });
    expect(screen.getByTestId("participant-empty")).toBeInTheDocument();
    expect(screen.queryAllByRole("checkbox")).toHaveLength(0);
  });

  it("toggles a participant and keeps member order", () => {
    const onChange = vi.fn();
    render(<ParticipantPicker members={members} selected={["3"]} onChange={onChange} />);
    fireEvent.click(screen.getByRole("checkbox", { name: /alice/i }));
    expect(onChange).toHaveBeenCalledWith(["1", "3"]);
  });

  it("moves focus with arrow keys within the filtered list", () => {
    render(<ParticipantPicker members={members} selected={[]} onChange={vi.fn()} />);
    fireEvent.change(screen.getByLabelText("Split between"), { target: { value: "gab" } });
    const boxes = screen.getAllByRole("checkbox");
    fireEvent.keyDown(screen.getByLabelText("Split between"), { key: "ArrowDown" });
    expect(boxes[0]).toHaveFocus();
    fireEvent.keyDown(boxes[0], { key: "ArrowDown" });
    expect(boxes[1]).toHaveFocus();
    fireEvent.keyDown(boxes[1], { key: "ArrowUp" });
    expect(boxes[0]).toHaveFocus();
  });
});
