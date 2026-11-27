const PREFIX = "mergepay:draft:";
const SCHEMA_VERSION = 1; // bump to invalidate old drafts when the form shape changes
const DEFAULT_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

export type WriteResult = "ok" | "quota" | "unavailable";

interface Envelope<T> {
  v: number;
  savedAt: number;
  data: T;
}

function getStorage(): Storage | null {
  try {
    // Accessing localStorage can itself throw (Safari private mode, blocked cookies, SSR)
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

function isQuotaError(e: unknown): boolean {
  return (
    e instanceof DOMException &&
    (e.name === "QuotaExceededError" ||
      e.name === "NS_ERROR_DOM_QUOTA_REACHED" ||
      e.code === 22 ||
      e.code === 1014)
  );
}

function parseEnvelope(raw: string | null): Envelope<unknown> | null {
  if (!raw) return null;
  try {
    const env = JSON.parse(raw) as Envelope<unknown>;
    if (
      typeof env === "object" &&
      env !== null &&
      env.v === SCHEMA_VERSION &&
      typeof env.savedAt === "number" &&
      "data" in env
    ) {
      return env;
    }
  } catch {
    /* corrupt JSON */
  }
  return null;
}

/** Remove expired, corrupt, or old-version drafts to free space. */
export function pruneDrafts(ttlMs = DEFAULT_TTL_MS): void {
  const s = getStorage();
  if (!s) return;
  const now = Date.now();
  const doomed: string[] = [];
  for (let i = 0; i < s.length; i++) {
    const k = s.key(i);
    if (!k || !k.startsWith(PREFIX)) continue;
    const env = parseEnvelope(s.getItem(k));
    if (!env || now - env.savedAt > ttlMs) doomed.push(k);
  }
  doomed.forEach((k) => s.removeItem(k));
}

export function readDraft(
  key: string,
  ttlMs = DEFAULT_TTL_MS
): { data: unknown; savedAt: number } | null {
  const s = getStorage();
  if (!s) return null;
  try {
    const env = parseEnvelope(s.getItem(PREFIX + key));
    if (!env || Date.now() - env.savedAt > ttlMs) {
      s.removeItem(PREFIX + key);
      return null;
    }
    return { data: env.data, savedAt: env.savedAt };
  } catch {
    return null;
  }
}

export function writeDraft(key: string, data: unknown): WriteResult {
  const s = getStorage();
  if (!s) return "unavailable";

  let payload: string;
  try {
    payload = JSON.stringify({ v: SCHEMA_VERSION, savedAt: Date.now(), data });
  } catch {
    return "unavailable"; // unserializable (e.g. circular) value
  }

  try {
    s.setItem(PREFIX + key, payload);
    return "ok";
  } catch (e) {
    if (!isQuotaError(e)) return "unavailable";
    pruneDrafts(); // free space, then retry once
    try {
      s.setItem(PREFIX + key, payload);
      return "ok";
    } catch {
      return "quota";
    }
  }
}

export function removeDraft(key: string): void {
  try {
    getStorage()?.removeItem(PREFIX + key);
  } catch {
    /* ignore */
  }
}
