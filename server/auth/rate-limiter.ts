import { redis } from '@/server/redis';

export class RateLimitError extends Error {
  constructor(
    message: string,
    public retryAfter: number,
    public limiterType: string
  ) {
    super(message);
    this.name = 'RateLimitError';
  }
}

export async function checkSignInRateLimit(ip: string): Promise<void> {
  const key = 'rl:signin:' + ip;
  const count = await redis.incr(key);
  if (count === 1) {
    await redis.expire(key, 900); 
  }
  if (count > 5) {
    const ttl = await redis.ttl(key);
    throw new RateLimitError('Too many sign-in attempts', ttl, 'signin');
  }
}

export async function checkSessionRateLimit(userId: string): Promise<void> {
  const key = 'rl:session:' + userId;
  const count = await redis.incr(key);
  if (count === 1) await redis.expire(key, 3600);
  if (count > 10) throw new RateLimitError('Too many sessions', 3600, 'session');
}

export async function checkSensitiveOpLimit(ip: string): Promise<void> {
  const key = 'rl:sensitive:' + ip;
  const count = await redis.incr(key);
  if (count === 1) await redis.expire(key, 300);
  if (count > 3) {
    await redis.expire(key, 1800); 
    throw new RateLimitError('Too many attempts', 1800, 'sensitive');
  }
}
