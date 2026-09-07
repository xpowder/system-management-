import type { Member, Member360, Member360Membership, Membership } from "./gymApi";

export const MEMBERSHIP_NAME_SEARCH_LIMIT = 20;

export function membershipFrom360(item: Member360Membership): Membership {
  return {
    id: item.id,
    member_id: item.member_id,
    member_name: item.member_name,
    plan_id: item.plan_id,
    start_date: item.start_date,
    end_date: item.end_date,
    price: item.price,
    status: item.status as Membership["status"],
    payment_status: item.payment_status as Membership["payment_status"],
    total_paid: item.total_paid,
    remaining_balance: item.remaining_balance,
    notes: item.notes,
  };
}

export function flattenMembershipsFromProfiles(
  profiles: Member360[],
  status = "",
): { memberships: Membership[]; members: Member[] } {
  const memberships: Membership[] = [];
  const members: Member[] = [];
  const seen = new Set<number>();
  for (const profile of profiles) {
    members.push(profile.member);
    for (const item of profile.memberships) {
      if (status && item.status !== status) continue;
      if (seen.has(item.id)) continue;
      seen.add(item.id);
      memberships.push(membershipFrom360(item));
    }
  }
  memberships.sort((a, b) => b.id - a.id);
  return { memberships, members };
}

type MembersSearch = (params: {
  search?: string;
  limit?: number;
  offset?: number;
  signal?: AbortSignal;
}) => Promise<{ items: Member[] }>;

type Member360Fetch = (id: number, options?: { signal?: AbortSignal }) => Promise<Member360>;

export async function resolveMembershipsByMemberSearch(options: {
  search: string;
  status?: string;
  signal?: AbortSignal;
  members: MembersSearch;
  member360: Member360Fetch;
}): Promise<{ memberships: Membership[]; members: Member[]; total: number }> {
  const people = await options.members({
    search: options.search,
    limit: MEMBERSHIP_NAME_SEARCH_LIMIT,
    offset: 0,
    signal: options.signal,
  });
  const profiles = await Promise.all(
    people.items.map((person) => options.member360(person.id, { signal: options.signal })),
  );
  const { memberships, members } = flattenMembershipsFromProfiles(profiles, options.status);
  return { memberships, members, total: memberships.length };
}
