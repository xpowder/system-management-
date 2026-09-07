import { describe, expect, it } from "vitest";
import {
  assertMembershipMoneyMatchesApi,
  membershipDue,
  membershipPaymentLabel,
} from "./membershipBalance";

describe("membershipBalance", () => {
  it("A unpaid: 120 / 0 → due 120 unpaid", () => {
    expect(membershipDue(120, 0)).toBe(120);
    expect(membershipPaymentLabel(120, 0)).toBe("unpaid");
  });

  it("B partial: 120 / 100 → due 20 partial", () => {
    expect(membershipDue(120, 100)).toBe(20);
    expect(membershipPaymentLabel(120, 100)).toBe("partial");
  });

  it("C fully paid: 120 / 120 → due 0 paid", () => {
    expect(membershipDue(120, 120)).toBe(0);
    expect(membershipPaymentLabel(120, 120)).toBe("paid");
  });

  it("D multiple payments: 50+50 against 120 → due 20", () => {
    expect(membershipDue(120, 50 + 50)).toBe(20);
  });

  it("E another membership payment must not change this due math", () => {
    const membershipA = { price: 120, total_paid: 100, remaining_balance: 20 };
    const membershipB = { price: 120, total_paid: 120, remaining_balance: 0 };
    expect(membershipDue(membershipA.price, membershipA.total_paid)).toBe(20);
    expect(membershipDue(membershipB.price, membershipB.total_paid)).toBe(0);
    expect(assertMembershipMoneyMatchesApi(membershipA)).toBe(true);
    expect(assertMembershipMoneyMatchesApi(membershipB)).toBe(true);
  });

  it("F historical period stays isolated in the formula", () => {
    const previous = { price: 120, total_paid: 120, remaining_balance: 0 };
    const current = { price: 120, total_paid: 100, remaining_balance: 20 };
    expect(membershipDue(previous.price, previous.total_paid)).toBe(0);
    expect(membershipDue(current.price, current.total_paid)).toBe(20);
  });

  it("G overpayment: paid 1320 on price 130 → due 0", () => {
    expect(membershipDue(130, 1320)).toBe(0);
    expect(membershipPaymentLabel(130, 1320)).toBe("paid");
    expect(
      assertMembershipMoneyMatchesApi({
        price: 130,
        total_paid: 1320,
        remaining_balance: 0,
      }),
    ).toBe(true);
  });

  it("trusts string API decimals the same way as the table", () => {
    expect(membershipDue("120.00", "100.00")).toBe(20);
    expect(
      assertMembershipMoneyMatchesApi({
        price: "120.00",
        total_paid: "100.00",
        remaining_balance: "20.00",
      }),
    ).toBe(true);
  });
});
