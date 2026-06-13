import { auth } from '@/auth';
import { db } from '@/server/db';
import { userSettings } from '@/server/db/schema';
import { eq } from 'drizzle-orm';
import { NextResponse } from 'next/server';

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.redirect(new URL('/login', req.url));
  }

  // Update user settings to mark connected
  await db.update(userSettings)
    .set({ gmailConnected: true, calendarConnected: true })
    .where(eq(userSettings.userId, session.user.id));

  return NextResponse.redirect(new URL('/inbox', req.url));
}
