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
