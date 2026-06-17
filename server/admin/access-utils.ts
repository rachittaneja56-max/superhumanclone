import "server-only";

export function resolveAdminAccess(params: {
  userId: string;
  email: string;
  isAdmin: boolean;
  adminUserIds?: string;
  adminEmails?: string;
}) {
  const adminIdSet = new Set(
    (params.adminUserIds ?? "")
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean),
  );
  const adminEmailSet = new Set(
    (params.adminEmails ?? "")
      .split(",")
      .map((value) => value.trim().toLowerCase())
      .filter(Boolean),
  );

  return params.isAdmin || adminIdSet.has(params.userId) || adminEmailSet.has(params.email.toLowerCase());
}
