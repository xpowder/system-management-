/** Stable id for one user payment click/retry. Backend stores it as Payment.idempotency_key. */
export function newPaymentAttemptId(): string {
  const cryptoApi = globalThis.crypto;
  if (cryptoApi && typeof cryptoApi.randomUUID === "function") {
    return cryptoApi.randomUUID().replace(/-/g, "").slice(0, 64);
  }
  return `pay${Date.now().toString(36)}${Math.random().toString(36).slice(2, 14)}`.slice(0, 64);
}

export function shouldReusePaymentAttempt(previousAmount: number, nextAmount: number): boolean {
  return Number.isFinite(previousAmount) && previousAmount === nextAmount;
}
