import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/server/db';
import { users } from '@/server/db/schema';
import { eq } from 'drizzle-orm';
import { encrypt } from '@/lib/crypto';
import { redis } from '@/server/redis';
import { auth } from '@/server/auth';

export async function GET(req: NextRequest) {
  const session = await auth();
  
  if (!session?.user?.id) {
    return NextResponse.redirect(new URL('/login', req.url));
  }

  const { searchParams } = new URL(req.url);
  const code = searchParams.get('code');

  if (!code) {
    return NextResponse.json({ error: 'Missing OAuth code' }, { status: 400 });
  }

  try {
    const tokenResponse = await fetch('https://api.corsair.dev/v1/oauth/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        code,
        client_id: process.env.CORSAIR_API_KEY,
        client_secret: process.env.CORSAIR_WEBHOOK_SECRET,
      }),
    });

    if (!tokenResponse.ok) {
      throw new Error(`Corsair token exchange failed: ${tokenResponse.status}`);
    }

    const data = await tokenResponse.json();
    const token = data.access_token || data.token;

    if (!token) {
      throw new Error('No access token returned from Corsair');
    }

    const encrypted = encrypt(token, process.env.ENCRYPTION_KEY!);

    await db
      .update(users)
      .set({ corsair_token_encrypted: encrypted })
      .where(eq(users.id, session.user.id));

    await redis.del(`session:valid:${session.user.id}`);

    return NextResponse.redirect(new URL('/inbox', req.url));
  } catch (error) {
    console.error('[Corsair Callback] Error:', error);
    return NextResponse.redirect(new URL('/inbox?error=auth_failed', req.url));
  }
}
