import { createRef } from "react";
import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { QRCodeSVG } from "./lazy-qr-code";

const VALUE = "https://mergepay.app/join/7QF3KD2P";

describe("lazy QRCodeSVG", () => {
  // The skeleton only paints while the `qrcode.react` chunk is unresolved, and
  // that chunk is cached at module scope after its first resolution. Asserting
  // the two phases from separate cases therefore made the result depend on which
  // case ran first (and on Vitest's shuffle order), so the cold-then-loaded
  // sequence is asserted against a single render instead.
  it("holds a sizing skeleton while the encoder loads, then paints the real code", async () => {
    const ref = createRef<SVGSVGElement>();
    const { container } = render(
      <QRCodeSVG ref={ref} value={VALUE} size={180} fgColor="#18130E" level="M" />
    );

    const skeleton = screen.getByRole("status", { name: /loading qr code/i });
    expect(skeleton).toHaveAttribute("aria-busy", "true");
    expect(skeleton).toHaveStyle({ width: "180px", height: "180px" });

    await waitFor(() =>
      expect(screen.queryByRole("status", { name: /loading qr code/i })).toBeNull()
    );

    await waitFor(() => expect(ref.current).toBeInstanceOf(SVGSVGElement));
    const svg = container.querySelector("svg");
    expect(svg).toBe(ref.current);
    expect(svg).toHaveAttribute("width", "180");
    expect(svg).toHaveAttribute("height", "180");
    expect(svg?.querySelector('path[fill="#18130E"]')).not.toBeNull();
  });
});
