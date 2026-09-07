import { describe, expect, it } from "vitest";
import { formatHttpError } from "./api";

describe("formatHttpError", () => {
  it("keeps invalid login messages on 401", () => {
    expect(formatHttpError(401, { detail: "Invalid username or password" })).toMatch(/invalid username/i);
  });

  it("treats other 401s as session expiry", () => {
    expect(formatHttpError(401, { detail: "Authentication credentials were not provided" })).toMatch(/session/i);
  });

  it("maps 403 to a permission message", () => {
    expect(formatHttpError(403, { detail: "forbidden" })).toMatch(/permission/i);
  });

  it("maps payment 409 to a refreshable balance message", () => {
    expect(formatHttpError(409, { detail: "Payment exceeds remaining balance. Remaining balance: 20.00 MAD." })).toMatch(
      /remaining balance changed/i,
    );
  });

  it("maps paid-membership delete 409", () => {
    expect(formatHttpError(409, { detail: "Membership with payment history cannot be deleted. Cancel it instead." })).toMatch(
      /cannot be deleted/i,
    );
  });

  it("keeps already-checked-in 409", () => {
    expect(formatHttpError(409, { detail: "This member is already checked in" })).toMatch(/already checked in/i);
  });

  it("maps 429", () => {
    expect(formatHttpError(429, {})).toMatch(/too many requests/i);
  });

  it("maps 422", () => {
    expect(formatHttpError(422, { amount: "must be greater than 0" })).toMatch(/amount/i);
  });

  it("hides stack traces", () => {
    expect(formatHttpError(500, { detail: 'Traceback (most recent call last):\nFile "views.py", line 1' })).toMatch(
      /server could not complete/i,
    );
  });
});
