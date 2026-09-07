import { describe, expect, it } from "vitest";
import { newPaymentAttemptId, shouldReusePaymentAttempt } from "./paymentAttempt";

describe("payment attempt ids", () => {
  it("creates a non-empty key within the backend limit", () => {
    const key = newPaymentAttemptId();
    expect(key.length).toBeGreaterThan(8);
    expect(key.length).toBeLessThanOrEqual(64);
  });

  it("creates distinct keys for new actions", () => {
    expect(newPaymentAttemptId()).not.toBe(newPaymentAttemptId());
  });

  it("reuses a key only when the amount is unchanged", () => {
    expect(shouldReusePaymentAttempt(100, 100)).toBe(true);
    expect(shouldReusePaymentAttempt(100, 80)).toBe(false);
  });
});
