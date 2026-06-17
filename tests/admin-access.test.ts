import { resolveAdminAccess } from "@/server/admin/access-utils";

describe("admin access", () => {
  it("blocks non-admin users from admin access", () => {
    expect(resolveAdminAccess({ isAdmin: false })).toBe(false);
  });

  it("allows explicit admin users", () => {
    expect(resolveAdminAccess({ isAdmin: true })).toBe(true);
  });
});
