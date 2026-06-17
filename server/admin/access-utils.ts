import "server-only";

export function resolveAdminAccess(params: {
  isAdmin: boolean;
}) {
  return params.isAdmin;
}
