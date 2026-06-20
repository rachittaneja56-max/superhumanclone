import { z } from "zod";

export const getAdminDashboardSchema = z.object({
  limit: z.number().int().min(1).max(100).default(25),
});

export const adminUserMutationSchema = z.object({
  userId: z.string().min(1),
});

export const adminEmailMutationSchema = z.object({
  email: z.email().transform((value) => value.trim().toLowerCase()),
});

export const changeUserPlanSchema = adminUserMutationSchema.extend({
  plan: z.enum(["free", "pro", "team"]),
});

export const flagUserSchema = adminUserMutationSchema.extend({
  flagged: z.boolean(),
});

export const setUserAiAccessSchema = adminUserMutationSchema.extend({
  enabled: z.boolean(),
});

export const resetUsageCounterSchema = adminUserMutationSchema.extend({
  kind: z.enum(["ai", "email-triage"]),
});

export const unlockAdminDashboardSchema = z.object({
  accessId: z.string().min(1, "Access ID is required").max(80),
  password: z.string().min(8, "Password must be at least 8 characters").max(120),
});

export const promoteUserToAdminByEmailSchema = adminEmailMutationSchema;

export const demoteUserToUserByEmailSchema = adminEmailMutationSchema;
