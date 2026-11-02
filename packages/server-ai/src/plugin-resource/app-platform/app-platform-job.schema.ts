import { z } from 'zod/v3'
export const appPlatformJobSchema = z.object({ deliveryId: z.string().uuid(), digest: z.string().regex(/^[a-f0-9]{64}$/) }).strict()
