import type { MemberBalance, User } from "./types";

export interface SimplifiedPath { from: User; to: User; fromUserId: string; toUserId: string; amount: string; assetCode: string; }

function parse(value: string): bigint {
  const [whole, fraction = ""] = value.replace(/^-/, "").split(".");
  const units = BigInt(whole) * 10_000_000n + BigInt(fraction.padEnd(7, "0"));
  return value.startsWith("-") ? -units : units;
}
function print(value: bigint): string {
  const sign = value < 0n ? "-" : ""; const abs = value < 0n ? -value : value;
  const fraction = (abs % 10_000_000n).toString().padStart(7, "0").replace(/0+$/, "");
  return `${sign}${abs / 10_000_000n}${fraction ? `.${fraction}` : ""}`;
}

/** Reduce member net balances to a deterministic minimum greedy payment set. */
export function simplifyDebts(members: MemberBalance[]): SimplifiedPath[] {
  // Nets only offset within one asset: a USDC credit is not payable in XLM, so
  // simplifying across assets would suggest a transfer that cannot settle and
  // label it with whichever asset the debtor happened to hold. Group first,
  // keeping each member's original order inside their own bucket.
  const byAsset = new Map<string, MemberBalance[]>();
  for (const member of members) {
    const bucket = byAsset.get(member.assetCode);
    if (bucket) bucket.push(member);
    else byAsset.set(member.assetCode, [member]);
  }
  const out: SimplifiedPath[] = [];
  for (const bucket of byAsset.values()) out.push(...simplifyAsset(bucket));
  return out;
}

function simplifyAsset(members: MemberBalance[]): SimplifiedPath[] {
  const creditors = members.filter((m) => parse(m.net) > 0n).map((m) => ({ ...m, value: parse(m.net) }));
  const debtors = members.filter((m) => parse(m.net) < 0n).map((m) => ({ ...m, value: -parse(m.net) }));
  const out: SimplifiedPath[] = []; let c = 0; let d = 0;
  while (c < creditors.length && d < debtors.length) {
    const amount = creditors[c].value < debtors[d].value ? creditors[c].value : debtors[d].value;
    out.push({ from: debtors[d].user, to: creditors[c].user, fromUserId: debtors[d].userId, toUserId: creditors[c].userId, amount: print(amount), assetCode: debtors[d].assetCode });
    creditors[c].value -= amount; debtors[d].value -= amount;
    if (creditors[c].value === 0n) c++; if (debtors[d].value === 0n) d++;
  }
  return out;
}
