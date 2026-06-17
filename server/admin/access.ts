import "server-only";

import { resolveAdminAccess } from "./access-utils";
import { db } from "@/server/db";
import { users } from "@/server/db/schema";
import { eq } from "drizzle-orm";

export async function getUserAdminState(userId: string) {
  const user = await db.query.users.findFirst({
    where: eq(users.id, userId),
    columns: {
      id: true,
      email: true,
      isAdmin: true,
    },
  });

  if (!user) {
    return { isAdmin: false };
  }

  return {
    isAdmin: resolveAdminAccess({
      userId: user.id,
      email: user.email,
      isAdmin: user.isAdmin,
      adminUserIds: process.env.ADMIN_USER_IDS ?? process.env.AI_ADMIN_USER_IDS ?? "",
      adminEmails: process.env.ADMIN_EMAILS ?? "",
    }),
  };
}
