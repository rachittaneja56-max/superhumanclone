import "server-only";

import { resolveAdminAccess, resolveUserRole } from "./access-utils";
import { db } from "@/server/db";
import { users } from "@/server/db/schema";
import { eq } from "drizzle-orm";

export async function getUserAdminState(userId: string) {
  let user:
    | {
        id: string;
        email: string;
        isAdmin: boolean;
        role?: "user" | "admin" | "superadmin" | null;
      }
    | undefined;

  try {
    user = await db.query.users.findFirst({
      where: eq(users.id, userId),
      columns: {
        id: true,
        email: true,
        isAdmin: true,
        role: true,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (!message.includes(`column "role" does not exist`)) {
      throw error;
    }

    user = await db.query.users.findFirst({
      where: eq(users.id, userId),
      columns: {
        id: true,
        email: true,
        isAdmin: true,
      },
    });
  }

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
