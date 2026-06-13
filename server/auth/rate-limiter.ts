// server/auth/rate-limiter.ts
import { redis } from '@/server/redis'

export class RateLimitError extends Error {
  constructor(
    message: string,
    public retryAfter: number,
    public limiterType: 'signin' | 'session' | 'sensitive'
  ) {
    super(message)
    this.name = 'RateLimitError'
  }
}

// Returns true if allowed, false if rate limited
export async function checkSignInRateLimit(ip: string): Promise<boolean> {
  const key = `rl:signin:${ip}`
  try {
    const count = await redis.incr(key)
    if (count === 1) await redis.expire(key, 900) // 15 min window
    if (count > 5) return false
    return true
  } catch {
    // If Redis fails, allow the request (fail open for auth)
    return true
  }
}

export async function checkSessionRateLimit(userId: string): Promise<boolean> {
  const key = `rl:session:${userId}`
  try {
    const count = await redis.incr(key)
    if (count === 1) await redis.expire(key, 3600)
    if (count > 10) return false
    return true
  } catch {
    return true
  }
}

export async function checkSensitiveOpLimit(ip: string): Promise<boolean> {
  const key = `rl:sensitive:${ip}`
  try {
    const count = await redis.incr(key)
    if (count === 1) await redis.expire(key, 300)
    if (count > 3) {
      await redis.expire(key, 1800) // extend block to 30 min
      return false
    }
    return true
  } catch {
    return true
  }
}
