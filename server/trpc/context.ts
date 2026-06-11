import { db } from '@/server/db';
import { Redis } from '@upstash/redis';
import { getServerSession } from 'next-auth';

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL!,
  token: process.env.UPSTASH_REDIS_REST_TOKEN!,
});

export const createContext = async () => {
  const session = await getServerSession();
  const userId = session?.user?.id || null;

  return {
    db,
    redis,
    session,
    userId,
  };
};

export type Context = Awaited<ReturnType<typeof createContext>>;
