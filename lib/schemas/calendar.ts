import { z } from 'zod';

export const smartFillFromThreadSchema = z.object({ threadId: z.string() });

export const createEventSchema = z.object({
  title: z.string().min(1),
  startTime: z.string().datetime(),
  endTime: z.string().datetime(),
  attendees: z.array(z.string().email()),
  description: z.string().optional(),
});

export const getEventsSchema = z.object({
  startDate: z.date(),
  endDate: z.date(),
});
