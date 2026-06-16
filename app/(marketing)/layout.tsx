import { MarketingNav } from '@/components/landing/MarketingNav';

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
      <footer className="border-t border-border py-8 text-center text-sm text-muted-foreground">
        <div className="max-w-7xl mx-auto px-6 flex justify-center space-x-6">
          <a href="/privacy" className="hover:text-foreground transition-colors">Privacy Policy</a>
          <span>&copy; {new Date().getFullYear()} Aethra</span>
        </div>
      </footer>
    </div>
  );
}
