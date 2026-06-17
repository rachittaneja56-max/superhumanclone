import { redirect } from "next/navigation";

import { AdminDashboardClient } from "@/components/admin/AdminDashboardClient";
import { getUserAdminState } from "@/server/admin/access";
import { getSession } from "@/lib/auth";
import { serverTrpc } from "@/lib/trpc/server";

export default async function AdminPage() {
  const session = await getSession();
  if (!session.userId) redirect("/login");

  const { isAdmin } = await getUserAdminState(session.userId);
  if (!isAdmin) redirect("/inbox");

  const trpc = await serverTrpc();
  const dashboard = await trpc.admin.getDashboard({ limit: 25 });

  return <AdminDashboardClient initialDashboard={dashboard} />;
}
