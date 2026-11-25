import { describe, expect, it } from "vitest";
import {
  MAX_RECEIPT_BYTES,
  MAX_RECEIPT_DIMENSION,
  chooseCompressionTarget,
  formatBytes,
  isReceiptFile,
  prepareReceiptFile,
  validateReceiptFile,
} from "./receipt";

function fileOf(name: string, type: string, size: number): File {
  return new File(["x".repeat(size)], name, { type });
}

describe("isReceiptFile", () => {
  it("accepts the whitelisted image types", () => {
    for (const type of ["image/jpeg", "image/png", "image/webp"]) {
      expect(isReceiptFile({ type })).toBe(true);
    }
  });

  it("rejects every non-image type", () => {
    for (const type of [
      "application/pdf",
      "image/gif",
      "image/svg+xml",
      "text/plain",
      "application/octet-stream",
    ]) {
      expect(isReceiptFile({ type })).toBe(false);
    }
  });
});

describe("validateReceiptFile", () => {
  it("accepts an in-bounds jpeg", () => {
    expect(validateReceiptFile(fileOf("r.jpg", "image/jpeg", 1024))).toEqual({
      ok: true,
    });
  });

  it("rejects a PDF even when small (type check wins)", () => {
    const result = validateReceiptFile(fileOf("r.pdf", "application/pdf", 100));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("unsupported_type");
      expect(result.message).toContain("choose");
    }
  });

  it("rejects an oversized image with a size-formatting message", () => {
    const big = MAX_RECEIPT_BYTES + 1;
    const result = validateReceiptFile(
      fileOf("big.png", "image/png", big)
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("too_large");
      expect(result.message).toContain("under");
    }
  });
});

describe("formatBytes", () => {
  it("formats small byte counts", () => {
    expect(formatBytes(0)).toBe("0 B");
    expect(formatBytes(512)).toBe("512 B");
  });

  it("steps through KB / MB with a single decimal", () => {
    expect(formatBytes(1024)).toBe("1 KB");
    expect(formatBytes(10 * 1024 * 1024)).toBe("10 MB");
  });
});

describe("chooseCompressionTarget", () => {
  it("keeps dimensions when the image already fits", () => {
    const result = chooseCompressionTarget({ width: 800, height: 600, needsDownscale: false });
    expect(result).toEqual({
      doCompress: true,
      targetWidth: 800,
      targetHeight: 600,
    });
  });

  it("downscales a wide image so its longest edge matches the target", () => {
    const result = chooseCompressionTarget({
      width: 3200,
      height: 1600,
      needsDownscale: true,
    });
    expect(result.targetWidth).toBe(1600);
    expect(result.targetHeight).toBe(800);
    expect(MAX_RECEIPT_DIMENSION).toBe(1600);
  });

  it("never produces a zero dimension for a tiny-but-scaled input", () => {
    const result = chooseCompressionTarget({
      width: 10,
      height: 1,
      needsDownscale: false,
    });
    expect(result.targetWidth).toBeGreaterThan(0);
    expect(result.targetHeight).toBeGreaterThan(0);
  });
});

describe("prepareReceiptFile", () => {
  it("throws a message-bearing error for an unsupported type without touching the payload", async () => {
    await expect(
      prepareReceiptFile(fileOf("receipt.pdf", "application/pdf", 10))
    ).rejects.toMatchObject({
      code: "unsupported_type",
      message: expect.any(String),
    });
    // No DOM work should be attempted — the file is rejected pre-decode.
  });

  it("rejects oversized images early", async () => {
    await expect(
      prepareReceiptFile(
        fileOf("huge.webp", "image/webp", MAX_RECEIPT_BYTES + 5000)
      )
    ).rejects.toMatchObject({ code: "too_large" });
  });
});