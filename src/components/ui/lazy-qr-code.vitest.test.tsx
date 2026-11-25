import { createRef } from "react";
import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { QRCodeSVG } from "./lazy-qr-code";

const VALUE = "https://mergepay.app/join/7QF3KD2P";

describe("lazy QRCodeSVG", () => {
  // Runs first: once the chunk is in the module cache the skeleton is skipped.
  it("holds a skeleton of exactly the code's size while the encoder loads", async () => {
    render(<QRCodeSVG value={VALUE} size={180} />);

    const skeleton = screen.getByRole("status", { name: /loading qr code/i });
    expect(skeleton).toHaveAttribute("aria-busy", "true");
    expect(skeleton).toHaveStyle({ width: "180px", height: "180px" });

    await waitFor(() =>
      expect(screen.queryByRole("status", { name: /loading qr code/i })).toBeNull()
    );
  });

  it("renders the real code with the same props and forwards the ref", async () => {
    const ref = createRef<SVGSVGElement>();
    const { container } = render(
      <QRCodeSVG ref={ref} value={VALUE} size={160} fgColor="#18130E" level="M" />
    );

    await waitFor(() => expect(ref.current).toBeInstanceOf(SVGSVGElement));
    const svg = container.querySelector("svg");
    expect(svg).toBe(ref.current);
    expect(svg).toHaveAttribute("width", "160");
    expect(svg).toHaveAttribute("height", "160");
    expect(svg?.querySelector('path[fill="#18130E"]')).not.toBeNull();
  });
});
