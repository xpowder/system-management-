import { describe, expect, it, vi } from "vitest";
import type { Member, Member360 } from "./gymApi";
import {
  MEMBERSHIP_NAME_SEARCH_LIMIT,
  flattenMembershipsFromProfiles,
  membershipFrom360,
  resolveMembershipsByMemberSearch,
} from "./membershipSearch";

function membership360(
  id: number,
  memberId: number,
  status = "active",
): Member360["memberships"][number] {
  return {
    id,
    member_id: memberId,
    plan_id: 1,
    plan: { id: 1, name: "Monthly", duration_months: 1, price: "200" },
    start_date: "2026-01-01",
    end_date: "2026-02-01",
    price: "200",
    status,
    payment_status: "partial",
    total_paid: "100",
    remaining_balance: "100",
  };
}

function profile(id: number, name: string, memberships: Member360["memberships"]): Member360 {
  return {
    member: {
      id,
      name,
      phone: "0600000000",
      email: `${id}@example.com`,
      is_active: true,
    },
    training_class: null,
    memberships,
    payments: [],
    attendance: [],
    reminder: null,
  };
}

describe("membershipFrom360", () => {
  it("maps a 360 membership onto the list Membership shape", () => {
    const mapped = membershipFrom360(membership360(9, 3));
    expect(mapped).toMatchObject({
      id: 9,
      member_id: 3,
      plan_id: 1,
      remaining_balance: "100",
    });
  });
});

describe("flattenMembershipsFromProfiles", () => {
  it("flattens memberships and drops duplicates", () => {
    const shared = membership360(4, 1);
    const result = flattenMembershipsFromProfiles([
      profile(1, "Ada", [shared, membership360(5, 1, "expired")]),
      profile(2, "Bea", [shared, membership360(6, 2)]),
    ]);
    expect(result.memberships.map((item) => item.id)).toEqual([6, 5, 4]);
    expect(result.members.map((member) => member.id)).toEqual([1, 2]);
  });

  it("applies a status filter without loading extra rows", () => {
    const result = flattenMembershipsFromProfiles(
      [profile(1, "Ada", [membership360(5, 1, "expired"), membership360(6, 1, "active")])],
      "active",
    );
    expect(result.memberships.map((item) => item.id)).toEqual([6]);
  });
});

describe("resolveMembershipsByMemberSearch", () => {
  it("resolves members from search, then their memberships", async () => {
    const members = vi.fn(async () => ({
      items: [{ id: 11, name: "Ada", phone: "", email: "" } satisfies Member],
    }));
    const member360 = vi.fn(async () => profile(11, "Ada", [membership360(21, 11)]));
    const result = await resolveMembershipsByMemberSearch({
      search: "Ada",
      members,
      member360,
    });
    expect(members).toHaveBeenCalledWith({
      search: "Ada",
      limit: MEMBERSHIP_NAME_SEARCH_LIMIT,
      offset: 0,
      signal: undefined,
    });
    expect(member360).toHaveBeenCalledWith(11, { signal: undefined });
    expect(result.total).toBe(1);
    expect(result.memberships[0]?.id).toBe(21);
  });

  it("returns an empty list when no members match", async () => {
    const result = await resolveMembershipsByMemberSearch({
      search: "zzz",
      members: async () => ({ items: [] }),
      member360: async () => {
        throw new Error("should not fetch 360");
      },
    });
    expect(result).toEqual({ memberships: [], members: [], total: 0 });
  });
});
