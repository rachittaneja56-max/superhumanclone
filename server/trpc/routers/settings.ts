import { router, protectedProcedure } from '../trpc';
import { aiConsentRules } from '../../db/schema';
import { eq } from 'drizzle-orm';
import { getUserSettingsSchema, updateSettingSchema, updatePrivacyRulesSchema } from '@/lib/schemas';
import { cacheTtls, invalidateSettingsCache, settingsCacheKey, settingsVersionKey } from '@/server/cache';
import { getSafeUserSettings, saveSafeUserSettings } from '@/server/db/user-settings-compat';

export const settingsRouter = router({
  getUserSettings: protectedProcedure
    .input(getUserSettingsSchema)
    .query(async ({ ctx }) => {
      const version = Number((await ctx.redis.get<string>(settingsVersionKey(ctx.userId!))) ?? '0');
      const cacheKey = settingsCacheKey(ctx.userId!, version);
      const cached = await ctx.redis.get<string>(cacheKey);
      if (cached) {
        try {
          return JSON.parse(cached);
        } catch {}
      }

      const settings = await getSafeUserSettings(ctx.userId!);

      await ctx.redis.set(cacheKey, JSON.stringify(settings), { ex: cacheTtls.settings });
      return settings;
  }),

  updateSetting: protectedProcedure
    .input(updateSettingSchema)
    .mutation(async ({ ctx, input }) => {
      await saveSafeUserSettings(ctx.userId!, { [input.key]: input.value })
      await invalidateSettingsCache(ctx.redis, ctx.userId!)
      return { updated: true }
    }),

  updatePrivacyRules: protectedProcedure
    .input(updatePrivacyRulesSchema)
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
      // Set privacyConfigured to true
      await saveSafeUserSettings(ctx.userId!, { privacyConfigured: true })
      await invalidateSettingsCache(ctx.redis, ctx.userId!)
      return { updated: true, count: input.rules.length }
    }),
});
