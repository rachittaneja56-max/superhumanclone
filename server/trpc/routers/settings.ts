import { router, protectedProcedure } from '../trpc';
import { auditLogs, aiConsentRules } from '../../db/schema';
import { eq } from 'drizzle-orm';
import { TRPCError } from '@trpc/server';
import { getUserSettingsSchema, updateSettingSchema, updatePrivacyRulesSchema } from '@/lib/schemas';
import { cacheTtls, invalidateSettingsCache, settingsCacheKey, settingsVersionKey } from '@/server/cache';
import { getSafeUserSettings, saveSafeUserSettings } from '@/server/db/user-settings-compat';
import { sanitisePayload } from '@/lib/sanitise-payload';

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

      const current = await getSafeUserSettings(ctx.userId!)
      if (current[input.key] !== input.value) {
        throw new TRPCError({
          code: 'PRECONDITION_FAILED',
          message: 'Settings could not be saved',
        });
      }

      await ctx.db.insert(auditLogs).values({
        userId: ctx.userId!,
        action: 'settings_changed',
        details: sanitisePayload({
          key: input.key,
          value: input.value,
        }),
      }).catch(() => undefined)

      return { updated: true, settings: current }
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
