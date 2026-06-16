import { z } from 'zod';

export const getAuditLogSchema = z.object({
  limit: z.number().default(50)
}).default({ limit: 50 });
