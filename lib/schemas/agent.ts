import { z } from 'zod';

export const getPendingHITLSchema = z.object({});

export const resolveHITLSchema = z.object({
  actionId: z.string().uuid(),
  decision: z.enum(['approved', 'rejected']),
});

export const agentHistoryMessageSchema = z.object({
  role: z.enum(['user', 'assistant']),
  content: z.string().min(1).max(5000),
});

export const chatMessageSchema = z.object({
  message: z.string().min(1).max(5000),
  sessionId: z.string().uuid(),
  threadContext: z.string().max(8000).optional(),
  allowMemory: z.boolean().default(false),
  history: z.array(agentHistoryMessageSchema).max(20).default([]),
});

export const clearAgentSessionSchema = z.object({
  sessionId: z.string().uuid(),
});

export const replaceAgentSessionHistorySchema = z.object({
  sessionId: z.string().uuid(),
  history: z.array(agentHistoryMessageSchema).max(20),
});
