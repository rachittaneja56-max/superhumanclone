import { z } from 'zod';
import { router, protectedProcedure } from '../trpc';
import { auditLogs } from '../../db/schema';
import { eq, desc } from 'drizzle-orm';

import { getAuditLogSchema } from '@/lib/schemas';
export const auditRouter = router({
  getAuditLog: protectedProcedure
    .input(getAuditLogSchema)
    .query(async ({ ctx, input }) => {
      const { limit } = input;
      
      return ctx.db.query.auditLogs.findMany({
        where: eq(auditLogs.userId, ctx.userId!),
        orderBy: [desc(auditLogs.created_at)],
        limit
      });
    })
});
