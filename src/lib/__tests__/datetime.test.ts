import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  TIMESTAMP_FALLBACK,
  TIMESTAMP_FALLBACK_FULL,
  describeTimestamp,
  formatRelativeTimestamp,
  formatTimestamp,
  formatTimestampFull,
  parseApiTimestamp,
  timestampMachineValue,
} from "../datetime";

/** Zones with opposite signs, so double conversion cannot hide. */
const LAGOS = "Africa/Lagos"; // UTC+1, no DST
const NEW_YORK = "America/New_York"; // UTC-5 / -4 with DST
const EN = "en-US";

describe("parseApiTimestamp", () => {
  it("parses a UTC instant", () => {
    const parsed = parseApiTimestamp("2026-07-29T15:04:05Z");
    assert.equal(parsed.kind, "instant");
    assert.equal(parsed.date?.toISOString(), "2026-07-29T15:04:05.000Z");
  });

  it("honours a positive offset without converting twice", () => {
    const parsed = parseApiTimestamp("2026-07-29T15:04:05+01:00");
    assert.equal(parsed.date?.toISOString(), "2026-07-29T14:04:05.000Z");
  });

  it("honours a negative offset without converting twice", () => {
    const parsed = parseApiTimestamp("2026-07-29T15:04:05-05:00");
    assert.equal(parsed.date?.toISOString(), "2026-07-29T20:04:05.000Z");
  });

  it("treats a date-only value as a calendar day, not UTC midnight", () => {
    const parsed = parseApiTimestamp("2026-07-29");
    assert.equal(parsed.kind, "date");
    // Anchored to local midnight, so the calendar fields survive
    // whatever zone the runtime is in.
    assert.equal(parsed.date?.getFullYear(), 2026);
    assert.equal(parsed.date?.getMonth(), 6);
    assert.equal(parsed.date?.getDate(), 29);
  });

  it("keeps the raw API value untouched", () => {
    const raw = "2026-07-29T15:04:05.123+01:00";
    assert.equal(parseApiTimestamp(raw).raw, raw);
  });

  it("reports invalid input instead of throwing", () => {
    for (const bad of [
      undefined,
      null,
      "",
      "   ",
      "not a date",
      "2026-13-01T00:00:00Z",
      "2026-02-30",
      42,
      {},
    ]) {
      const parsed = parseApiTimestamp(bad);
      assert.equal(parsed.kind, "invalid", `${String(bad)} should be invalid`);
      assert.equal(parsed.date, null);
    }
  });
});

describe("formatTimestamp", () => {
  it("renders an instant in the reader's zone", () => {
    const iso = "2026-07-29T23:30:00Z";
    // 00:30 the next day in Lagos, 19:30 the same day in New York.
    assert.match(
      formatTimestamp(iso, { timeZone: LAGOS, locale: EN }),
      /Jul 30, 2026/
    );
    assert.match(
      formatTimestamp(iso, { timeZone: NEW_YORK, locale: EN }),
      /Jul 29, 2026/
    );
  });

  it("renders the same instant differently per zone but from one parse", () => {
    const iso = "2026-07-29T15:04:05+01:00";
    const lagos = formatTimestamp(iso, { timeZone: LAGOS, locale: EN });
    const newYork = formatTimestamp(iso, { timeZone: NEW_YORK, locale: EN });
    assert.match(lagos, /3:04/);
    assert.match(newYork, /10:04/);
  });

  it("does not shift a date-only value across midnight", () => {
    // A negative-offset zone is where UTC-midnight parsing goes wrong.
    for (const timeZone of [LAGOS, NEW_YORK, "Pacific/Kiritimati"]) {
      assert.equal(
        formatTimestamp("2026-07-29", { timeZone, locale: EN }),
        "Jul 29, 2026"
      );
    }
  });

  it("omits a time from a date-only value", () => {
    const formatted = formatTimestamp("2026-07-29", { locale: EN });
    assert.equal(/\d:\d\d/.test(formatted), false);
  });

  it("falls back safely for invalid and missing values", () => {
    assert.equal(formatTimestamp(undefined), TIMESTAMP_FALLBACK);
    assert.equal(formatTimestamp("nonsense"), TIMESTAMP_FALLBACK);
    assert.equal(formatTimestamp(""), TIMESTAMP_FALLBACK);
  });
});

describe("formatTimestamp — daylight saving boundary", () => {
  // US DST 2026 starts 08 Mar at 02:00 local (07:00Z) and ends 01 Nov.
  it("uses standard time before the spring-forward instant", () => {
    assert.match(
      formatTimestamp("2026-03-08T06:30:00Z", { timeZone: NEW_YORK, locale: EN }),
      /1:30/
    );
  });

  it("uses daylight time after the spring-forward instant", () => {
    assert.match(
      formatTimestamp("2026-03-08T07:30:00Z", { timeZone: NEW_YORK, locale: EN }),
      /3:30/
    );
  });

  it("names the offset that actually applied", () => {
    assert.match(
      formatTimestampFull("2026-03-08T06:30:00Z", {
        timeZone: NEW_YORK,
        locale: EN,
      }),
      /EST/
    );
    assert.match(
      formatTimestampFull("2026-03-08T07:30:00Z", {
        timeZone: NEW_YORK,
        locale: EN,
      }),
      /EDT/
    );
  });

  it("keeps a date-only value on its calendar day across the boundary", () => {
    assert.equal(
      formatTimestamp("2026-03-08", { timeZone: NEW_YORK, locale: EN }),
      "Mar 8, 2026"
    );
  });
});

describe("formatTimestampFull", () => {
  it("spells out the date, time and zone", () => {
    const full = formatTimestampFull("2026-07-29T15:04:05Z", {
      timeZone: LAGOS,
      locale: EN,
    });
    assert.match(full, /Wednesday/);
    assert.match(full, /July 29, 2026/);
    assert.match(full, /4:04/);
  });

  it("omits a time for date-only values", () => {
    const full = formatTimestampFull("2026-07-29", { locale: EN });
    assert.match(full, /July 29, 2026/);
    assert.equal(/\d:\d\d/.test(full), false);
  });

  it("falls back for unparseable values", () => {
    assert.equal(formatTimestampFull(null), TIMESTAMP_FALLBACK_FULL);
  });
});

describe("formatRelativeTimestamp", () => {
  it("describes a past instant relative to now", () => {
    const now = new Date("2026-07-29T15:00:00Z");
    const label = formatRelativeTimestamp("2026-07-29T12:00:00Z", { now });
    assert.match(label, /3 hours ago/);
  });

  it("falls back for unparseable values", () => {
    assert.equal(formatRelativeTimestamp("nope"), TIMESTAMP_FALLBACK);
  });
});

describe("timestampMachineValue", () => {
  it("normalises an instant to ISO for the datetime attribute", () => {
    assert.equal(
      timestampMachineValue("2026-07-29T15:04:05+01:00"),
      "2026-07-29T14:04:05.000Z"
    );
  });

  it("keeps a date-only value as a plain date", () => {
    assert.equal(timestampMachineValue("2026-07-29"), "2026-07-29");
  });

  it("returns null when there is nothing valid to emit", () => {
    assert.equal(timestampMachineValue("nope"), null);
    assert.equal(timestampMachineValue(undefined), null);
  });
});

describe("describeTimestamp", () => {
  it("bundles every representation of one instant", () => {
    const now = new Date("2026-07-29T18:04:05Z");
    const described = describeTimestamp("2026-07-29T15:04:05Z", {
      timeZone: LAGOS,
      locale: EN,
      now,
    });
    assert.equal(described.valid, true);
    assert.equal(described.kind, "instant");
    assert.match(described.short, /Jul 29, 2026/);
    assert.match(described.full, /July 29, 2026/);
    assert.match(described.relative, /3 hours ago/);
    assert.equal(described.machine, "2026-07-29T15:04:05.000Z");
  });

  it("marks an unparseable value invalid with safe text", () => {
    const described = describeTimestamp("garbage");
    assert.equal(described.valid, false);
    assert.equal(described.kind, "invalid");
    assert.equal(described.short, TIMESTAMP_FALLBACK);
    assert.equal(described.full, TIMESTAMP_FALLBACK_FULL);
    assert.equal(described.machine, null);
  });

  it("does not mutate the value it was given", () => {
    const raw = "2026-07-29T15:04:05Z";
    describeTimestamp(raw, { timeZone: NEW_YORK });
    assert.equal(raw, "2026-07-29T15:04:05Z");
    // Sorting still uses the untouched API string.
    const sorted = [
      "2026-07-29T15:04:05Z",
      "2026-07-28T15:04:05Z",
    ].sort();
    assert.deepEqual(sorted, [
      "2026-07-28T15:04:05Z",
      "2026-07-29T15:04:05Z",
    ]);
  });
});
