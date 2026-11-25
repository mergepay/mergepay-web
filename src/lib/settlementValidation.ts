export function validateSettlementAmount(amount: number): boolean {
  return amount > 0 && Number.isFinite(amount);
}
