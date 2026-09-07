import { describe, expect, it } from "vitest";
import type { AuthUser } from "./api";
import { can, isGymAdmin, isGymDesk } from "./permissions";

function user(role: string, is_staff = false): AuthUser {
  return {
    id: 1,
    username: "staff",
    first_name: "A",
    last_name: "B",
    email: "",
    role,
    is_staff,
    date_joined: "2026-01-01",
  };
}

describe("permissions", () => {
  it("lets reception use the desk but not admin money pages", () => {
    const reception = user("Reception");
    expect(isGymDesk(reception)).toBe(true);
    expect(isGymAdmin(reception)).toBe(false);
    expect(can(reception, "desk.use")).toBe(true);
    expect(can(reception, "reports.financial")).toBe(false);
    expect(can(reception, "admin.users")).toBe(false);
  });

  it("lets admin use staff and financial pages", () => {
    const admin = user("Admin");
    expect(isGymAdmin(admin)).toBe(true);
    expect(can(admin, "desk.use")).toBe(true);
    expect(can(admin, "trainers.manage")).toBe(true);
    expect(can(admin, "expenses.manage")).toBe(true);
  });
});
