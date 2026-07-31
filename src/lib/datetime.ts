/**
 * Shared date and time presentation for expenses, settlements, treasury
 * moves and history.
 *
 * API timestamps are strings (see `createdAt` / `joinedAt` / `expiresAt`
 * in `src/lib/types.ts`) and reach the client in two flavours:
 *
 *  - instants: full ISO 8601 with an offset (`2026-07-29T15:04:05Z`,
 *    `2026-07-29T15:04:05+01:00`). These describe a moment in time and
 *    must be rendered in the reader's local zone.
 *  - date-only business values (`2026-07-29`). These describe a calendar
 *    day with no instant attached. Treating them as UTC midnight and
 *    then converting to a negative-offset zone shifts them to the
 *    previous day, which for financial records is simply wrong.
 *
 * Parsing therefore distinguishes the two, and every formatter goes
 * through `parseApiTimestamp` so a single convention applies everywhere.
 * The original API value is never mutated — sorting and round-tripping
 * keep using the raw string.
 */

import { formatDistance, formatDistanceToNow } from "date-fns";

/** `YYYY-MM-DD` with no time component. */
const DATE_ONLY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Shown in place of a date we cannot parse. */
export const TIMESTAMP_FALLBACK = "—";
/** Accessible / hover text for a date we cannot parse. */
export const TIMESTAMP_FALLBACK_FULL = "Date unavailable";

export type TimestampKind = "instant" | "date" | "invalid";

export interface ParsedTimestamp {
  kind: TimestampKind;
  /** `null` when the value could not be parsed. */
  date: Date | null;
  /** The value exactly as the API sent it, for `datetime` attributes. */
  raw: string | null;
}

export interface TimestampFormatOptions {
  /**
   * IANA zone to render in. Defaults to the runtime zone, which is what
   * production uses; tests pass an explicit zone to stay deterministic.
   */
  timeZone?: string;
  /** BCP-47 locale. Defaults to the runtime locale. */
  locale?: string;
  /** Reference point for relative labels. Defaults to `new Date()`. */
  now?: Date;
}

/**
 * Parse an API timestamp without guessing.
 *
 * Date-only values are anchored to local midnight so that formatting
 * them in the reader's zone yields the same calendar day the API meant.
 * Instants are parsed by the platform, which honours the offset in the
 * string; no second conversion is applied anywhere downstream.
 */
export function parseApiTimestamp(value: unknown): ParsedTimestamp {
  if (typeof value !== "string") {
    return { kind: "invalid", date: null, raw: null };
  }
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return { kind: "invalid", date: null, raw: null };
  }

  const dateOnly = DATE_ONLY_PATTERN.exec(trimmed);
  if (dateOnly) {
    const [, year, month, day] = dateOnly;
    // Local midnight, not UTC midnight: a date-only value has no
    // instant, so it must not be shifted by the reader's offset.
    const date = new Date(Number(year), Number(month) - 1, Number(day));
    if (Number.isNaN(date.getTime())) {
      return { kind: "invalid", date: null, raw: trimmed };
    }
    // Reject impossible calendar days (2026-02-30 rolls over otherwise).
    if (
      date.getFullYear() !== Number(year) ||
      date.getMonth() !== Number(month) - 1 ||
      date.getDate() !== Number(day)
    ) {
      return { kind: "invalid", date: null, raw: trimmed };
    }
    return { kind: "date", date, raw: trimmed };
  }

  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) {
    return { kind: "invalid", date: null, raw: trimmed };
  }
  return { kind: "instant", date: parsed, raw: trimmed };
}

function dateTimeFormat(
  options: TimestampFormatOptions,
  parts: Intl.DateTimeFormatOptions
): Intl.DateTimeFormat {
  return new Intl.DateTimeFormat(options.locale, {
    ...parts,
    ...(options.timeZone ? { timeZone: options.timeZone } : {}),
  });
}

/**
 * Compact label for lists and cards: `Jul 29, 2026, 3:04 PM` for an
 * instant, `Jul 29, 2026` for a date-only value.
 */
export function formatTimestamp(
  value: unknown,
  options: TimestampFormatOptions = {}
): string {
  const parsed = parseApiTimestamp(value);
  if (!parsed.date) return TIMESTAMP_FALLBACK;

  if (parsed.kind === "date") {
    // No zone conversion: the anchor is already local midnight, and
    // passing a `timeZone` here would move the calendar day.
    return new Intl.DateTimeFormat(options.locale, {
      year: "numeric",
      month: "short",
      day: "numeric",
    }).format(parsed.date);
  }

  return dateTimeFormat(options, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(parsed.date);
}

/**
 * Unabbreviated label with the zone spelled out — used as the accessible
 * name and the hover title, so the exact time is always recoverable even
 * where the compact or relative form is displayed.
 */
export function formatTimestampFull(
  value: unknown,
  options: TimestampFormatOptions = {}
): string {
  const parsed = parseApiTimestamp(value);
  if (!parsed.date) return TIMESTAMP_FALLBACK_FULL;

  if (parsed.kind === "date") {
    return new Intl.DateTimeFormat(options.locale, {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
    }).format(parsed.date);
  }

  return dateTimeFormat(options, {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  }).format(parsed.date);
}

/**
 * Relative label (`3 hours ago`). Always paired with an exact timestamp
 * by callers — for financial records a relative label alone is not
 * enough to identify when something happened.
 */
export function formatRelativeTimestamp(
  value: unknown,
  options: TimestampFormatOptions = {}
): string {
  const parsed = parseApiTimestamp(value);
  if (!parsed.date) return TIMESTAMP_FALLBACK;
  // `formatDistanceToNow` reads the clock itself; an explicit reference
  // point goes through `formatDistance` so callers (and tests) can pin it.
  return options.now
    ? formatDistance(parsed.date, options.now, { addSuffix: true })
    : formatDistanceToNow(parsed.date, { addSuffix: true });
}

/**
 * Value for the `datetime` attribute of a `<time>` element.
 *
 * Returns the API string for a date-only value (already a valid HTML
 * date) and a normalised ISO instant otherwise. `null` when the value
 * cannot be parsed, so callers omit the element rather than emit an
 * invalid attribute.
 */
export function timestampMachineValue(value: unknown): string | null {
  const parsed = parseApiTimestamp(value);
  if (!parsed.date) return null;
  if (parsed.kind === "date") return parsed.raw;
  return parsed.date.toISOString();
}

export interface DescribedTimestamp {
  valid: boolean;
  kind: TimestampKind;
  /** Compact display text. */
  short: string;
  /** Full text for the accessible name and hover title. */
  full: string;
  /** Relative text, e.g. `3 hours ago`. */
  relative: string;
  /** `datetime` attribute value, or `null` when unparseable. */
  machine: string | null;
}

/**
 * Everything a renderer needs for one timestamp, computed once.
 */
export function describeTimestamp(
  value: unknown,
  options: TimestampFormatOptions = {}
): DescribedTimestamp {
  const parsed = parseApiTimestamp(value);
  return {
    valid: parsed.date !== null,
    kind: parsed.kind,
    short: formatTimestamp(value, options),
    full: formatTimestampFull(value, options),
    relative: formatRelativeTimestamp(value, options),
    machine: timestampMachineValue(value),
  };
}
