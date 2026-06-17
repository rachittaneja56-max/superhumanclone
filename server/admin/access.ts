import "server-only";

import { resolveAdminAccess, resolveUserRole } from "./access-utils";
import { db } from "@/server/db";
import { users } from "@/server/db/schema";
import { eq } from "drizzle-orm";
import { getUsersColumnPresence } from "@/server/db/users-compat";

export async function getUserAdminState(userId: string) {
  const columns = await getUsersColumnPresence();
  const user = await db.query.users.findFirst({
    where: eq(users.id, userId),
    columns: {
      id: true,
      email: true,
      ...(columns.hasIsAdmin ? { isAdmin: true } : {}),
      ...(columns.hasRole ? { role: true } : {}),
    },
  }) as
    | {
        id: string;
        email: string;
        isAdmin?: boolean;
        role?: "user" | "admin" | "superadmin" | null;
      }
    | undefined;

  if (!user) {
    return { role: "user" as const, isAdmin: false, isSuperadmin: false };
  }

  const role = resolveUserRole({
    email: user.email,
    role: user.role,
    isAdmin: user.isAdmin,
  });

  return {
    role,
    isAdmin: resolveAdminAccess({
      email: user.email,
      role: user.role,
      isAdmin: user.isAdmin,
    }),
    isSuperadmin: role === "superadmin",
  };
}
