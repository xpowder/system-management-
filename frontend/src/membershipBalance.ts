/** Authoritative membership money helpers — prefer API `total_paid` / `remaining_balance`. */

export function asMoneyNumber(value: string | number | null | undefined) {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
}

/** due = max(price - paid_for_this_membership, 0) */
export function membershipDue(price: string | number, paid: string | number) {
  return Math.max(asMoneyNumber(price) - asMoneyNumber(paid), 0);
}

export function membershipPaymentLabel(
  price: string | number,
  paid: string | number,
): "unpaid" | "partial" | "paid" {
  const p = asMoneyNumber(price);
  const t = asMoneyNumber(paid);
  if (t <= 0) return "unpaid";
  if (t >= p) return "paid";
  return "partial";
}

export function assertMembershipMoneyMatchesApi(item: {
  price: string | number;
  total_paid: string | number;
  remaining_balance: string | number;
}) {
  const due = membershipDue(item.price, item.total_paid);
  return Math.abs(due - asMoneyNumber(item.remaining_balance)) < 0.005;
}
