import { resolveAdminAccess } from "@/server/admin/access-utils";

describe("admin access", () => {
  it("blocks non-admin users from admin access", () => {
    expect(
      resolveAdminAccess({
        userId: "user-1",
        email: "user@example.com",
        isAdmin: false,
        adminUserIds: "",
        adminEmails: "",
      }),
    ).toBe(false);
  });

  it("allows explicit admin users", () => {
    expect(
      resolveAdminAccess({
        userId: "admin-1",
        email: "admin@example.com",
        isAdmin: true,
        adminUserIds: "",
        adminEmails: "",
      }),
    ).toBe(true);
  });
});
