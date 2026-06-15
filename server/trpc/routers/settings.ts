import { z } from 'zod';
import { router, protectedProcedure } from '../trpc';
import { db } from '../../db';
import { aiConsentRules, userSettings } from '../../db/schema';
import { eq } from 'drizzle-orm';
import { redis } from '../../redis';

export const settingsRouter = router({
  getUserSettings: protectedProcedure.query(async ({ ctx }) => {
    return ctx.db.query.userSettings.findFirst({
      where: eq(userSettings.userId, ctx.userId!),
    })
  }),

  updateSetting: protectedProcedure
    .input(z.object({
      key: z.enum(['aiEnabled','draftSuggestionsEnabled','autoTagEnabled']),
      value: z.boolean(),
    }))
    .mutation(async ({ ctx, input }) => {
      await ctx.db.update(userSettings)
        .set({ [input.key]: input.value })
        .where(eq(userSettings.userId, ctx.userId!))
      return { updated: true }
    }),

  updatePrivacyRules: protectedProcedure
    .input(z.object({
      rules: z.array(z.object({
        pattern: z.string().max(200),
        isBlocked: z.boolean(),
        groupName: z.string().optional(),
      })),
    }))
    .mutation(async ({ ctx, input }) => {
      // Delete existing rules
      await ctx.db.delete(aiConsentRules)
        .where(eq(aiConsentRules.userId, ctx.userId!))
      // Insert new rules
      if (input.rules.length > 0) {
        await ctx.db.insert(aiConsentRules).values(
          input.rules.map(r => ({
            userId: ctx.userId!,
            pattern: r.pattern,
            isBlocked: r.isBlocked,
            groupName: r.groupName ?? 'custom',
            ruleType: 'custom_domain' as const,
          }))
        )
      }
      // Invalidate consent cache
      await ctx.redis.incr('consent_version:' + ctx.userId)
      return { updated: true, count: input.rules.length }
    }),
});
