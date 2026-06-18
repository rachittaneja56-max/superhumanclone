import { MarketingNav } from '@/components/landing/MarketingNav';
import Link from 'next/link';

import { getSession } from '@/lib/auth';
import { db } from '@/server/db';
import { users } from '@/server/db/schema';
import { eq } from 'drizzle-orm';

export default async function MarketingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getSession();
  let userEmail: string | null = null;
  let userName: string | null = null;

  if (session.userId) {
    const localUser = await db.query.users.findFirst({
      where: eq(users.id, session.userId),
      columns: { email: true, name: true }
    });
    userEmail = localUser?.email ?? null;
    userName = localUser?.name ?? null;
  }

  return (
    <div className="min-h-screen flex flex-col font-sans">
      <div id="nav-sentinel" className="absolute top-0 h-[100vh] w-px pointer-events-none opacity-0" />
      <MarketingNav userEmail={userEmail} userName={userName} />
      <main className="flex-1">{children}</main>
      <footer className="border-t border-border bg-surface/70">
        <div className="mx-auto flex w-full max-w-7xl flex-col gap-5 px-6 py-8 text-sm text-foreground-muted sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-1">
            <div className="font-medium text-foreground">Aethra</div>
            <p>Inbox, calendar, and agent work in one private workspace.</p>
          </div>
          <div className="flex flex-wrap items-center gap-4">
            <Link href="/privacy" className="transition-colors hover:text-foreground">Privacy Policy</Link>
            <Link href="/login" className="transition-colors hover:text-foreground">Sign in</Link>
            <Link href="/inbox" className="rounded-full border border-border bg-background px-4 py-2 font-medium text-foreground transition-colors hover:bg-surface-raised">
              Open inbox
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
