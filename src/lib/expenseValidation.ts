/**
 * Client-side validation for the add-expense form.
 *
 * Everything here is a pure function over plain values so it can be
 * tested without React, and so the form and any future caller apply the
 * same rules. This is a *first* boundary only — the API validates the
 * same payload again, and these checks never replace that.
 *
 * All amount arithmetic runs on integer stroops (1 stroop = 10^-7, the
 * smallest unit Stellar represents). Comparing decimal sums as
 * JavaScript numbers gives wrong answers for ordinary inputs — `0.1 +
 * 0.2 === 0.3` is false — so no split total is ever compared as a float.
 */

import { MAX_DECIMAL_PLACES } from "./money";

/** Decimal places accepted for an expense amount (Stellar's precision). */
export const AMOUNT_DECIMAL_PLACES = MAX_DECIMAL_PLACES;

/** Decimal places accepted for a percentage share. */
export const PERCENT_DECIMAL_PLACES = 2;

/** 100% in the integer units used for percentage arithmetic. */
const ONE_HUNDRED_PERCENT = 100n * 10n ** BigInt(PERCENT_DECIMAL_PLACES);

export const MAX_TITLE_LENGTH = 80;

/**
 * Plain decimal notation only. Exponential forms ("1e5"), signs, and the
 * trailing junk `parseFloat` happily ignores ("50abc") are all rejected.
 */
const DECIMAL_PATTERN = /^(?:\d+(?:\.\d*)?|\.\d+)$/;

/**
 * Parse a decimal string into integer units scaled by `decimalPlaces`.
 *
 * Returns `null` when the string is not plain decimal notation, and
 * `"too_precise"` when it carries more decimals than the scale allows,
 * so callers can tell "not a number" from "too many decimals" and show
 * the right message.
 */
export function parseDecimalUnits(
  raw: string,
  decimalPlaces: number
): bigint | null | "too_precise" {
  const trimmed = raw.trim();
  if (!DECIMAL_PATTERN.test(trimmed)) return null;

  const dot = trimmed.indexOf(".");
  const intPart = dot === -1 ? trimmed : trimmed.slice(0, dot);
  const fracPart = dot === -1 ? "" : trimmed.slice(dot + 1);

  if (fracPart.length > decimalPlaces) return "too_precise";

  const scaled = fracPart.padEnd(decimalPlaces, "0");
  return (
    BigInt(intPart || "0") * 10n ** BigInt(decimalPlaces) +
    BigInt(scaled || "0")
  );
}

/** Render integer units back as a plain decimal string. */
export function formatDecimalUnits(
  units: bigint,
  decimalPlaces: number
): string {
  const scale = 10n ** BigInt(decimalPlaces);
  const whole = units / scale;
  const frac = (units % scale).toString().padStart(decimalPlaces, "0");
  const trimmed = frac.replace(/0+$/, "");
  return trimmed ? `${whole}.${trimmed}` : `${whole}`;
}

/** Convenience wrapper for expense amounts. */
export function formatAmountUnits(units: bigint): string {
  return formatDecimalUnits(units, AMOUNT_DECIMAL_PLACES);
}

/**
 * Split `total` stroops across `count` participants without losing or
 * inventing a stroop: everyone gets the floor share and the remainder is
 * handed out one stroop at a time to the earliest participants. The sum
 * of the result is exactly `total`.
 *
 * The form renders these values, so a split that cannot divide evenly is
 * visible to the user rather than silently rounded.
 */
export function splitEqualUnits(total: bigint, count: number): bigint[] {
  if (count <= 0) return [];
  const size = BigInt(count);
  const base = total / size;
  const remainder = total % size;
  return Array.from({ length: count }, (_, i) =>
    BigInt(i) < remainder ? base + 1n : base
  );
}

export type FormErrors = Partial<Record<string, string>>;

export interface ExpenseFormInput {
  title: string;
  amount: string;
  assetCode: string;
  splitType: string;
  payerUserId: string;
  participants: string[];
  /** Per-participant amounts keyed by user id (splitType "custom"). */
  custom: Record<string, string>;
  /** Per-participant percentages keyed by user id (splitType "percentage"). */
  percent: Record<string, string>;
}

export interface ExpenseFormContext {
  /** User ids of the current group members. */
  memberIds: readonly string[];
  /** Asset codes the app is configured to accept. */
  supportedAssetCodes: readonly string[];
}

function validateAmount(raw: string, errors: FormErrors): bigint | null {
  if (!raw.trim()) {
    errors.amount = "Amount is required";
    return null;
  }

  const units = parseDecimalUnits(raw, AMOUNT_DECIMAL_PLACES);
  if (units === "too_precise") {
    errors.amount = `Amount can have at most ${AMOUNT_DECIMAL_PLACES} decimal places`;
    return null;
  }
  if (units === null) {
    errors.amount = "Enter an amount as a plain number, for example 42.50";
    return null;
  }
  if (units <= 0n) {
    errors.amount = "Amount must be greater than zero";
    return null;
  }
  return units;
}

function validateParticipants(
  input: ExpenseFormInput,
  members: ReadonlySet<string>,
  errors: FormErrors
): string[] {
  const participants = input.participants;

  if (participants.length === 0) {
    errors.participants = "Select at least one participant";
    return [];
  }

  if (new Set(participants).size !== participants.length) {
    errors.participants = "A participant is selected more than once";
    return participants;
  }

  if (participants.some((id) => !members.has(id))) {
    errors.participants =
      "One of the selected participants is not a member of this group";
  }

  return participants;
}

function validateCustomSplit(
  input: ExpenseFormInput,
  participants: string[],
  amountUnits: bigint | null,
  errors: FormErrors
): void {
  let sum = 0n;

  for (const id of participants) {
    const raw = input.custom[id] ?? "";
    if (!raw.trim()) {
      errors.custom = "Enter an amount for every participant";
      return;
    }
    const units = parseDecimalUnits(raw, AMOUNT_DECIMAL_PLACES);
    if (units === "too_precise") {
      errors.custom = `Each share can have at most ${AMOUNT_DECIMAL_PLACES} decimal places`;
      return;
    }
    if (units === null) {
      errors.custom = "Each share must be a plain number";
      return;
    }
    if (units <= 0n) {
      errors.custom = "Each share must be greater than zero";
      return;
    }
    sum += units;
  }

  // Comparing against the total is only meaningful once it parsed.
  if (amountUnits === null) return;

  if (sum !== amountUnits) {
    const difference = sum - amountUnits;
    const target = formatAmountUnits(amountUnits);
    errors.custom =
      difference > 0n
        ? `Shares are over by ${formatAmountUnits(difference)} — they must add up to ${target}`
        : `Shares are short by ${formatAmountUnits(-difference)} — they must add up to ${target}`;
  }
}

function validatePercentageSplit(
  input: ExpenseFormInput,
  participants: string[],
  errors: FormErrors
): void {
  let sum = 0n;

  for (const id of participants) {
    const raw = input.percent[id] ?? "";
    if (!raw.trim()) {
      errors.percent = "Enter a percentage for every participant";
      return;
    }
    const units = parseDecimalUnits(raw, PERCENT_DECIMAL_PLACES);
    if (units === "too_precise") {
      errors.percent = `Percentages can have at most ${PERCENT_DECIMAL_PLACES} decimal places`;
      return;
    }
    if (units === null) {
      errors.percent = "Each percentage must be a plain number";
      return;
    }
    if (units <= 0n) {
      errors.percent = "Each percentage must be greater than zero";
      return;
    }
    sum += units;
  }

  if (sum !== ONE_HUNDRED_PERCENT) {
    errors.percent = `Percentages add up to ${formatDecimalUnits(
      sum,
      PERCENT_DECIMAL_PLACES
    )}% — they must add up to 100%`;
  }
}

/**
 * Validate the whole form. Returns `null` when everything passes, or a
 * map of field name to message. The keys match the field ids the form
 * uses to wire up `aria-describedby`.
 */
export function validateExpenseForm(
  input: ExpenseFormInput,
  context: ExpenseFormContext
): FormErrors | null {
  const errors: FormErrors = {};
  const members = new Set(context.memberIds);

  const title = input.title.trim();
  if (!title) {
    errors.title = "Title is required";
  } else if (title.length > MAX_TITLE_LENGTH) {
    errors.title = `Title must be ${MAX_TITLE_LENGTH} characters or fewer`;
  }

  const amountUnits = validateAmount(input.amount, errors);

  if (!context.supportedAssetCodes.includes(input.assetCode)) {
    errors.assetCode = "Choose one of the supported assets";
  }

  if (!input.payerUserId) {
    errors.payer = "Choose who paid";
  } else if (!members.has(input.payerUserId)) {
    errors.payer = "The selected payer is not a member of this group";
  }

  const participants = validateParticipants(input, members, errors);

  if (input.splitType === "custom") {
    if (!errors.participants) {
      validateCustomSplit(input, participants, amountUnits, errors);
    }
  } else if (input.splitType === "percentage") {
    if (!errors.participants) {
      validatePercentageSplit(input, participants, errors);
    }
  } else if (input.splitType === "equal") {
    // An equal split is derived, so it always sums to the amount — but
    // only while every participant can receive at least one stroop.
    // Below that the split would silently drop people to zero.
    if (
      amountUnits !== null &&
      !errors.participants &&
      participants.length > 0 &&
      amountUnits < BigInt(participants.length)
    ) {
      errors.amount = `Amount is too small to split between ${participants.length} people`;
    }
  } else {
    errors.splitType = "Choose how to split this expense";
  }

  return Object.keys(errors).length > 0 ? errors : null;
}
