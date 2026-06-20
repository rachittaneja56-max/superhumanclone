import "server-only";

export type UserRole = "user" | "admin" | "superadmin";
export const FIXED_SUPERADMIN_EMAIL = "rachittaneja56@gmail.com";

export function normalizeEmail(email: string | null | undefined) {
  return email?.trim().toLowerCase() ?? "";
}

export function isFixedSuperadminEmail(email: string | null | undefined) {
  return normalizeEmail(email) === FIXED_SUPERADMIN_EMAIL;
}

export function resolveUserRole(params: {
  email?: string | null;
  role?: string | null;
  isAdmin?: boolean | null;
}): UserRole {
  if (isFixedSuperadminEmail(params.email)) {
    return "superadmin";
  }

  if (params.role === "superadmin") {
    return "superadmin";
  }

  if (params.role === "admin") {
    return "admin";
  }

  if (params.isAdmin) {
    return "admin";
  }

  return "user";
}

export function resolveAdminAccess(params: {
  email?: string | null;
  role?: string | null;
  isAdmin?: boolean | null;
}) {
  return resolveUserRole(params) !== "user";
}

export function isAdminUser(role?: string | null) {
  return role === "admin" || role === "superadmin";
}
