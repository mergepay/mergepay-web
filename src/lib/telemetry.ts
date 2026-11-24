/**
 * Privacy-conscious product telemetry (#886).
 *
 * A small typed event layer between the app and whatever analytics backend is
 * plugged in. Call sites record *what happened* (`track("group_created", …)`),
 * never *who* or *with what keys*, and they never import a vendor SDK, so the
 * provider can be swapped with {@link setTelemetryProvider} without touching
 * them.
 *
 * Privacy guarantees, enforced here rather than trusted to each caller:
 *
 * - Every event name and its allowed properties are declared in
 *   {@link TelemetryEventMap}. TypeScript rejects anything else at compile
 *   time, and {@link sanitizeTelemetryProperties} drops it again at runtime.
 * - Property *keys* that look like secrets or identifiers (keys, seeds,
 *   signatures, XDR, tokens, addresses, names, emails, memos, hashes, …) are
 *   dropped even if a future event declares them by mistake.
 * - String *values* are dropped when they look like a Stellar account or
 *   secret seed, a JWT, an email, or a long base64/hex blob (signed XDR,
 *   transaction hashes). Strings are capped at a short length.
 * - Only primitive values are kept: no objects, arrays or errors, which is
 *   how stack traces and request payloads usually leak.
 * - Nothing is sent while the browser's Do Not Track is on, and the default
 *   provider is a no-op, so nothing leaves the device until a provider is set.
 * - A failing provider can never break the flow it is observing.
 */

import type { SettlementStatus } from "./types";

/** Coarse outcome category for failures. Never a raw error message. */
export type TelemetryErrorCode =
  | "not_installed"
  | "user_rejected"
  | "network_mismatch"
  | "network"
  | "locked"
  | "disconnected"
  | "unauthorized"
  | "validation"
  | "timeout"
  | "unknown";

/** Stage of the SEP-10 wallet login in which something happened. */
export type WalletLoginStage = "connect" | "network_check" | "challenge" | "sign" | "verify";

/**
 * Every event the app may emit and the only properties it may carry.
 * Add new events here; the type system and the sanitizer both read from it.
 */
export interface TelemetryEventMap {
  /** User started the Freighter + SEP-10 login. */
  wallet_connect_started: Record<string, never>;
  /** SEP-10 challenge transaction received from the API. */
  wallet_sep10_challenge_received: Record<string, never>;
  /** Freighter signed the SEP-10 challenge. */
  wallet_sep10_challenge_signed: Record<string, never>;
  /** API verified the signed challenge and issued a session. */
  wallet_connect_succeeded: { durationMs: number };
  /** Login failed; `stage` is where the funnel dropped. */
  wallet_connect_failed: { stage: WalletLoginStage; errorCode: TelemetryErrorCode; durationMs: number };
  /** Wallet disconnected or switched account mid-session. */
  wallet_disconnected: { reason: "disconnected" | "account_changed" };

  group_created: { hasDescription: boolean };
  group_create_failed: { errorCode: TelemetryErrorCode };

  expense_created: { splitType: "equal" | "custom" | "percentage"; participantCount: number };
  expense_create_failed: { errorCode: TelemetryErrorCode };

  settlement_submitted: { status: SettlementStatus };
  settlement_failed: { errorCode: TelemetryErrorCode };
  bulk_settlement_submitted: { expenseCount: number };
  bulk_settlement_failed: { errorCode: TelemetryErrorCode };
}

export type TelemetryEventName = keyof TelemetryEventMap;

export type TelemetryPropertyValue = string | number | boolean;
export type TelemetryProperties = Record<string, TelemetryPropertyValue>;

/** What a provider receives: already sanitized, ready to ship. */
export interface TelemetryEvent {
  name: TelemetryEventName;
  properties: TelemetryProperties;
  /** Epoch milliseconds. */
  timestamp: number;
}

/** Implement this to send events to an analytics backend. */
export interface TelemetryProvider {
  track(event: TelemetryEvent): void;
}

/** Default provider: drops everything. */
export const noopTelemetryProvider: TelemetryProvider = { track: () => {} };

/** Development helper: logs each sanitized event to the console. */
export const consoleTelemetryProvider: TelemetryProvider = {
  track: (event) => {
    // eslint-disable-next-line no-console
    console.debug("[telemetry]", event.name, event.properties);
  },
};

/** Keys a property is allowed to have per event; anything else is dropped. */
const ALLOWED_PROPERTIES: { [K in TelemetryEventName]: readonly (keyof TelemetryEventMap[K] & string)[] } = {
  wallet_connect_started: [],
  wallet_sep10_challenge_received: [],
  wallet_sep10_challenge_signed: [],
  wallet_connect_succeeded: ["durationMs"],
  wallet_connect_failed: ["stage", "errorCode", "durationMs"],
  wallet_disconnected: ["reason"],
  group_created: ["hasDescription"],
  group_create_failed: ["errorCode"],
  expense_created: ["splitType", "participantCount"],
  expense_create_failed: ["errorCode"],
  settlement_submitted: ["status"],
  settlement_failed: ["errorCode"],
  bulk_settlement_submitted: ["expenseCount"],
  bulk_settlement_failed: ["errorCode"],
};

/**
 * Property keys that are never sent, whatever event declares them. Matched as
 * substrings, so the list avoids fragments that occur inside harmless words
 * (`ip` in "participantCount", `member` in "memberCount"); identifiers are caught
 * by their `…Id` / `…Key` / `…Name` forms instead.
 */
const SENSITIVE_KEY =
  /(secret|seed|private|mnemonic|passphrase|password|signature|signed|xdr|envelope|token|jwt|auth|cookie|key|address|account|email|phone|name|memo|hash|ipaddr|^ip$|userid|memberid|destination|issuer)/i;

const STELLAR_STRKEY = /\b[GSMTXP][A-Z2-7]{55}\b/;
const JWT = /\beyJ[\w-]+\.[\w-]+\.[\w-]*/;
const EMAIL = /[^\s@]+@[^\s@]+\.[^\s@]+/;
const LONG_HEX = /\b[0-9a-f]{32,}\b/i;
const LONG_BASE64 = /[A-Za-z0-9+/=_-]{40,}/;
const MAX_STRING_LENGTH = 64;

/** `true` if the string looks like a key, token, address, email, hash or XDR blob. */
export function looksSensitive(value: string): boolean {
  return (
    STELLAR_STRKEY.test(value) ||
    JWT.test(value) ||
    EMAIL.test(value) ||
    LONG_HEX.test(value) ||
    LONG_BASE64.test(value)
  );
}

/**
 * Reduce raw properties to what may leave the device for `name`: only
 * declared keys, only primitives, no sensitive-looking keys or values, and
 * strings truncated to a short length.
 */
export function sanitizeTelemetryProperties(
  name: TelemetryEventName,
  properties: Record<string, unknown> | undefined
): TelemetryProperties {
  const allowed = new Set<string>(ALLOWED_PROPERTIES[name] ?? []);
  const result: TelemetryProperties = {};
  if (!properties) return result;

  for (const [key, value] of Object.entries(properties)) {
    if (!allowed.has(key) || SENSITIVE_KEY.test(key)) continue;
    if (typeof value === "number") {
      if (Number.isFinite(value)) result[key] = value;
    } else if (typeof value === "boolean") {
      result[key] = value;
    } else if (typeof value === "string") {
      if (!looksSensitive(value)) result[key] = value.slice(0, MAX_STRING_LENGTH);
    }
  }
  return result;
}

/**
 * Initial provider. Nothing is sent anywhere by default; set
 * `NEXT_PUBLIC_TELEMETRY_DEBUG=true` to log sanitized events to the console
 * while developing, or call {@link setTelemetryProvider} to wire a backend.
 */
function defaultProvider(): TelemetryProvider {
  return process.env.NEXT_PUBLIC_TELEMETRY_DEBUG === "true" ? consoleTelemetryProvider : noopTelemetryProvider;
}

let provider: TelemetryProvider = defaultProvider();
let enabledOverride: boolean | null = null;

/** Plug in an analytics backend. Pass `null` to go back to the default. */
export function setTelemetryProvider(next: TelemetryProvider | null): void {
  provider = next ?? defaultProvider();
}

/** Force telemetry on or off (`null` restores the default: on unless Do Not Track). */
export function setTelemetryEnabled(enabled: boolean | null): void {
  enabledOverride = enabled;
}

/** Whether events are currently forwarded to the provider. */
export function isTelemetryEnabled(): boolean {
  if (enabledOverride !== null) return enabledOverride;
  if (typeof navigator !== "undefined") {
    const dnt =
      navigator.doNotTrack ??
      (typeof window !== "undefined" ? (window as Window & { doNotTrack?: string }).doNotTrack : undefined);
    if (dnt === "1" || dnt === "yes") return false;
  }
  return true;
}

/** Record a product event. Safe to call anywhere; never throws. */
export function track<E extends TelemetryEventName>(
  name: E,
  ...args: TelemetryEventMap[E] extends Record<string, never>
    ? [properties?: TelemetryEventMap[E]]
    : [properties: TelemetryEventMap[E]]
): void {
  if (!isTelemetryEnabled()) return;
  try {
    provider.track({
      name,
      properties: sanitizeTelemetryProperties(name, args[0] as Record<string, unknown> | undefined),
      timestamp: Date.now(),
    });
  } catch {
    // Telemetry must never break the flow it observes.
  }
}

/**
 * Map any thrown value to a coarse, non-identifying category. Reads only the
 * error's `code`/`status`/`name`; the message (which can quote keys or
 * server responses) is never forwarded.
 */
export function telemetryErrorCode(error: unknown): TelemetryErrorCode {
  if (!error || typeof error !== "object") return "unknown";
  const candidate = error as { code?: unknown; status?: unknown; name?: unknown };

  const known: readonly TelemetryErrorCode[] = [
    "not_installed",
    "user_rejected",
    "network_mismatch",
    "network",
    "locked",
    "disconnected",
    "unauthorized",
    "validation",
    "timeout",
  ];
  if (typeof candidate.code === "string" && (known as readonly string[]).includes(candidate.code)) {
    return candidate.code as TelemetryErrorCode;
  }
  if (candidate.name === "NetworkMismatchError") return "network_mismatch";
  if (candidate.name === "WalletNotInstalledError") return "not_installed";
  if (candidate.name === "ApiValidationError") return "validation";
  if (candidate.name === "AbortError" || candidate.name === "TimeoutError") return "timeout";
  if (typeof candidate.status === "number") {
    if (candidate.status === 401 || candidate.status === 403) return "unauthorized";
    if (candidate.status === 400 || candidate.status === 422) return "validation";
    if (candidate.status === 408 || candidate.status === 504) return "timeout";
    return "network";
  }
  return "unknown";
}

/** Test seam: restore defaults. */
export function resetTelemetry(): void {
  provider = defaultProvider();
  enabledOverride = null;
}
