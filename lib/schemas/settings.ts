import { z } from 'zod';

export const getUserSettingsSchema = z.object({});

export const updateSettingSchema = z.object({
  key: z.enum(['aiEnabled','draftSuggestionsEnabled','autoTagEnabled']),
  value: z.boolean(),
});

export const updatePrivacyRulesSchema = z.object({
  rules: z.array(z.object({
    pattern: z.string().max(200),
    isBlocked: z.boolean(),
    groupName: z.string().optional(),
  })),
});
