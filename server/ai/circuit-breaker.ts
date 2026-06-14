import { redis } from '../redis';

export class BudgetExceededError extends Error {
  constructor(message?: string) {
    super(message || 'AI daily token budget exceeded');
    this.name = 'BudgetExceededError';
  }
}

export async function checkAndIncrementBudget(userId: string, tokens: number): Promise<void> {
  const today = new Date();
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, '0');
  const day = String(today.getDate()).padStart(2, '0');
  const dateStr = `${year}-${month}-${day}`;
  
  const key = `tokens:${userId}:${dateStr}`;
  const current = parseInt((await redis.get<string>(key)) ?? '0');
  const limit = parseInt(process.env.AI_DAILY_TOKEN_LIMIT ?? '100000');

  if (current + tokens > limit) {
    throw new BudgetExceededError();
  }

  await redis.incrby(key, tokens);
  await redis.expire(key, 86400); // Expire after 24 hours (86400 seconds)
}
