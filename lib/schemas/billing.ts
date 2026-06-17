import { z } from "zod";

export const getBillingOverviewSchema = z.object({});

export const simulatePlanChangeSchema = z.object({
  plan: z.enum(["free", "pro", "team"]),
});
