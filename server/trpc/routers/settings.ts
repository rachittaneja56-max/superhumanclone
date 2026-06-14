
import { z } from 'zod';
import { router, protectedProcedure } from '../trpc';
import { db } from '../../db';
import { aiConsentRules, userSettings } from '../../db/schema';
import { eq } from 'drizzle-orm';
import { redis } from '../../redis';

export const settingsRouter = router({
  updateConsentRules: protectedProcedure
    .input(
      z.object({
        rules: z.array(
          z.object({
            pattern: z.string(),
            isBlocked: z.boolean(),
            ruleType: z.enum(['domain_group', 'custom_domain']),
            groupName: z.string().optional(),
          })
        ),
      })
    )
    .mutation(async ({ ctx, input }) => {
      if (!ctx.userId) throw new Error('Unauthorized');
      
      // 1. Delete old rules
      await db.delete(aiConsentRules).where(eq(aiConsentRules.userId, ctx.userId));

      // 2. Insert new rules
      if (input.rules.length > 0) {
        await db.insert(aiConsentRules).values(
          input.rules.map((r) => ({
            userId: ctx.userId!,
            pattern: r.pattern,
            isBlocked: r.isBlocked,
            ruleType: r.ruleType,
            groupName: r.groupName,
          }))
        );
      }

      // 3. Invalidate Redis consent cache via version increment
      await redis.incr(`consent_version:${ctx.userId}`);

      return { success: true };
    }),

  toggleDraftSuggestions: protectedProcedure
    .input(z.object({ enabled: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      await db.update(userSettings)
        .set({ draftSuggestionsEnabled: input.enabled })
        .where(eq(userSettings.userId, ctx.userId!));
      return { success: true };
    }),
});
