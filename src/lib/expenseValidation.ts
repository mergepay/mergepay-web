/**
 * Expense split validation and normalization.
 *
 * Client-side validation exists to give precise, immediate feedback — it never
 * replaces the server's own checks. Everything here is a pure function so the
 * rules can be tested without React.
 *
 * Split totals are compared as exact integers (stroops for amounts, ten-
 * thousandths of a percent for percentages) via `parseExactDecimal`. Binary
 * floating-point comparison would report false mismatches for perfectly valid
 * inputs such as three shares of `0.1` against a total of `0.3`.
 */

import { MAX_DECIMAL_PLACES, parseExactDecimal } from "./money";
import { validateSettlementAsset } from "./paymentValidation";
import type { ExpenseShareInput, SplitType } from "./types";

/** Fractional digits accepted on a percentage share. */
export const MAX_PERCENT_DECIMAL_PLACES = 4;

/** Percentage shares must add up to exactly 100%. */
const PERCENT_TOTAL = BigInt(100) * BigInt(10) ** BigInt(MAX_PERCENT_DECIMAL_PLACES);

export const MAX_TITLE_LENGTH = 80;

const SPLIT_TYPES: readonly SplitType[] = ["equal", "custom", "percentage"];

/** Field-level errors, keyed by form field name. */
export type FormErrors = Partial<Record<string, string>>;

/** Per-participant errors, keyed by user id. */
export type ParticipantErrors = Record<string, string>;

export interface ExpenseSplitDraft {
  title: string;
  amount: string;
  splitType: string;
  /** User ids of the members sharing this expense. */
  participants: string[];
  /** splitType=custom — user id → decimal amount string. */
  custom: Record<string, string>;
  /** splitType=percentage — user id → percentage string. */
  percent: Record<string, string>;
  assetCode?: string;
  assetIssuer?: string | null;
  /**
   * User ids that may currently be selected. Supply the group's live member
   * list so participants who left mid-edit are reported instead of being sent
   * to the API. Omit to skip the membership check.
   */
  eligibleParticipantIds?: string[];
}

/** The exact values to send to the API once a draft validates. */
export interface NormalizedExpenseSplit {
  title: string;
  /** Plain decimal, at most 7 dp, numerically identical to the input. */
  amount: string;
  splitType: SplitType;
  shares: ExpenseShareInput[];
}

export interface ExpenseValidationResult {
  valid: boolean;
  errors: FormErrors;
  participantErrors: ParticipantErrors;
  /** Populated only when `valid` is true. */
  normalized: NormalizedExpenseSplit | null;
}

function isSplitType(value: string): value is SplitType {
  return (SPLIT_TYPES as readonly string[]).includes(value);
}

/**
 * Validate a single share value (a custom amount or a percentage).
 * Returns the exact scaled integer, or a user-facing error message.
 */
function parseShareValue(
  raw: string,
  scale: number,
  label: "amount" | "percentage"
): { scaled: bigint; plain: string } | { error: string } {
  const parsed = parseExactDecimal(raw ?? "", scale);
  if (!parsed.ok) {
    if (parsed.error === "empty") return { error: `Enter ${label === "amount" ? "an amount" : "a percentage"}` };
    if (parsed.error === "too_precise") {
      return { error: `At most ${scale} decimal place${scale === 1 ? "" : "s"}` };
    }
    return { error: `Enter a valid ${label}` };
  }
  if (parsed.value.scaled <= BigInt(0)) {
    return { error: `Must be greater than zero` };
  }
  return { scaled: parsed.value.scaled, plain: parsed.value.plain };
}

/** Render a scaled integer back as a plain decimal string. */
function scaledToPlain(scaled: bigint, scale: number): string {
  const negative = scaled < BigInt(0);
  const digits = (negative ? -scaled : scaled).toString().padStart(scale + 1, "0");
  const intPart = digits.slice(0, digits.length - scale);
  const frac = scale === 0 ? "" : digits.slice(digits.length - scale).replace(/0+$/, "");
  return `${negative ? "-" : ""}${intPart}${frac ? `.${frac}` : ""}`;
}

/**
 * Exact sum of decimal strings, for the "so far" hint shown next to a split.
 * Unparseable entries contribute nothing so the hint stays stable while the
 * user is mid-keystroke.
 */
export function sumDecimalStrings(values: string[], scale: number): string {
  let sum = BigInt(0);
  for (const value of values) {
    const parsed = parseExactDecimal(value ?? "", scale);
    if (parsed.ok) sum += parsed.value.scaled;
  }
  return scaledToPlain(sum, scale);
}

/**
 * Validate an expense draft and, when it is valid, produce the exact payload
 * fields for `CreateExpenseRequest`.
 */
export function validateExpenseSplit(
  draft: ExpenseSplitDraft
): ExpenseValidationResult {
  const errors: FormErrors = {};
  const participantErrors: ParticipantErrors = {};

  // --- title ---------------------------------------------------------------
  const title = draft.title.trim();
  if (!title) {
    errors.title = "Title is required";
  } else if (title.length > MAX_TITLE_LENGTH) {
    errors.title = `Title must be ${MAX_TITLE_LENGTH} characters or fewer`;
  }

  // --- amount --------------------------------------------------------------
  let totalStroops: bigint | null = null;
  let normalizedAmount = "";
  const invalidAmountMessage = `Amount must be positive with at most ${MAX_DECIMAL_PLACES} decimal places`;
  const parsedAmount = parseExactDecimal(draft.amount ?? "", MAX_DECIMAL_PLACES);
  if (!parsedAmount.ok) {
    errors.amount =
      parsedAmount.error === "empty" ? "Amount is required" : invalidAmountMessage;
  } else if (parsedAmount.value.scaled <= BigInt(0)) {
    errors.amount = invalidAmountMessage;
  } else {
    totalStroops = parsedAmount.value.scaled;
    normalizedAmount = parsedAmount.value.plain;
  }

  // --- asset ---------------------------------------------------------------
  if (draft.assetCode !== undefined) {
    const assetResult = validateSettlementAsset(
      draft.assetCode,
      draft.assetIssuer ?? null
    );
    if (!assetResult.valid) {
      errors.asset = assetResult.error ?? "Unsupported asset";
    }
  }

  // --- split type ----------------------------------------------------------
  const splitType = isSplitType(draft.splitType) ? draft.splitType : null;
  if (!splitType) {
    errors.splitType = "Choose how to split this expense";
  }

  // --- participants --------------------------------------------------------
  const participants = draft.participants ?? [];
  const eligible = draft.eligibleParticipantIds;

  if (eligible !== undefined && eligible.length === 0) {
    errors.participants =
      "This group has no members who can share an expense yet";
  } else if (participants.length === 0) {
    errors.participants = "Select at least one participant";
  } else {
    const seen = new Set<string>();
    const duplicates = new Set<string>();
    for (const id of participants) {
      if (seen.has(id)) duplicates.add(id);
      seen.add(id);
    }
    if (duplicates.size > 0) {
      errors.participants = "Each participant can only be selected once";
      for (const id of duplicates) {
        participantErrors[id] = "Selected more than once";
      }
    }

    if (eligible !== undefined) {
      const eligibleSet = new Set(eligible);
      const missing = participants.filter((id) => !eligibleSet.has(id));
      if (missing.length > 0) {
        errors.participants =
          missing.length === 1
            ? "A selected participant is no longer a member of this group"
            : "Some selected participants are no longer members of this group";
        for (const id of missing) {
          participantErrors[id] = "No longer a member of this group";
        }
      }
    }
  }

  // Participant-dependent split checks only make sense once the selection and
  // the total are themselves usable.
  const uniqueParticipants = Array.from(new Set(participants));
  const canCheckSplit =
    !errors.participants && uniqueParticipants.length > 0 && totalStroops !== null;

  const shares: ExpenseShareInput[] = [];

  if (splitType === "equal" && canCheckSplit) {
    for (const userId of uniqueParticipants) shares.push({ userId });
  }

  if (splitType === "custom" && canCheckSplit) {
    let sum = BigInt(0);
    let anyInvalid = false;
    for (const userId of uniqueParticipants) {
      const result = parseShareValue(draft.custom?.[userId] ?? "", MAX_DECIMAL_PLACES, "amount");
      if ("error" in result) {
        participantErrors[userId] = result.error;
        anyInvalid = true;
        continue;
      }
      sum += result.scaled;
      shares.push({ userId, amount: result.plain });
    }

    if (anyInvalid) {
      errors.custom = "Fix the highlighted share amounts";
    } else if (sum !== totalStroops) {
      errors.custom = `Custom amounts must sum to ${normalizedAmount} (currently ${scaledToPlain(sum, MAX_DECIMAL_PLACES)})`;
    }
  }

  if (splitType === "percentage" && canCheckSplit) {
    let sum = BigInt(0);
    let anyInvalid = false;
    for (const userId of uniqueParticipants) {
      const result = parseShareValue(
        draft.percent?.[userId] ?? "",
        MAX_PERCENT_DECIMAL_PLACES,
        "percentage"
      );
      if ("error" in result) {
        participantErrors[userId] = result.error;
        anyInvalid = true;
        continue;
      }
      if (result.scaled > PERCENT_TOTAL) {
        participantErrors[userId] = "Cannot exceed 100%";
        anyInvalid = true;
        continue;
      }
      sum += result.scaled;
      shares.push({ userId, percent: Number(result.plain) });
    }

    if (anyInvalid) {
      errors.percent = "Fix the highlighted percentages";
    } else if (sum !== PERCENT_TOTAL) {
      errors.percent = "Percentages must sum to 100";
    }
  }

  const valid =
    Object.keys(errors).length === 0 && Object.keys(participantErrors).length === 0;

  return {
    valid,
    errors,
    participantErrors,
    normalized:
      valid && splitType && totalStroops !== null
        ? { title, amount: normalizedAmount, splitType, shares }
        : null,
  };
}

/**
 * Backwards-compatible wrapper returning only field-level errors.
 *
 * @returns `null` when the draft is valid, otherwise a map of field → message.
 */
export function validateExpenseForm(draft: ExpenseSplitDraft): FormErrors | null {
  const result = validateExpenseSplit(draft);
  if (result.valid) return null;
  if (Object.keys(result.errors).length > 0) return result.errors;
  // Defensive: every participant-level error is also reported at field level,
  // but never hand back an "invalid with no errors" result.
  return { participants: "Fix the highlighted participants" };
}
