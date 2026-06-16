import { z } from 'zod';

export const getContactIntelSchema = z.object({ contactEmail: z.string().email() });
