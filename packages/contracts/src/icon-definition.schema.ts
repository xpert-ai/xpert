import { z } from 'zod/v3'

/** Public presentation metadata only. Renderers retain their own sandbox and URL policies. */
export const iconDefinitionSchema = z.object({
  type: z.enum(['image', 'svg', 'font', 'emoji', 'lottie']),
  value: z.string().min(1).max(65536),
  color: z.string().optional(),
  size: z.number().finite().positive().optional(),
  alt: z.string().optional(),
  style: z.record(z.string()).optional()
})
