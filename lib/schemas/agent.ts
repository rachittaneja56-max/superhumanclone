import { z } from 'zod';

export const getPendingHITLSchema = z.object({});

export const resolveHITLSchema = z.object({
  actionId: z.string().uuid(),
  decision: z.enum(['approved', 'rejected']),
});

export const chatMessageSchema = z.object({
  message: z.string().min(1).max(5000),
  sessionId: z.string().uuid(),
});
