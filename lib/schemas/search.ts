import { z } from 'zod';

export const vectorSearchSchema = z.object({
  query: z.string().min(1).max(500),
  limit: z.number().default(20)
});

export const textSearchSchema = z.object({
  query: z.string().min(1).max(500),
  limit: z.number().default(20)
});

export const searchContactsSchema = z.object({
  query: z.string().min(1).max(100),
});
