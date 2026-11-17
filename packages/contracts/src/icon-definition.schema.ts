import { z } from 'zod/v3'
import type { IconDefinition } from './types'

const iconShape = {
  type: z.enum(['image', 'svg', 'font', 'emoji', 'lottie']),
  value: z.string().min(1).max(65536),
  color: z.string().optional(),
  size: z.number().finite().positive().optional(),
  alt: z.string().optional(),
  style: z.record(z.string()).optional()
}

/** Public presentation metadata only. Renderers retain their own sandbox and URL policies.
 * Explicit output keeps required fields when contracts build without strictNullChecks,
 * while retaining the object schema's composition methods for existing consumers. */
export const iconDefinitionSchema = new z.ZodObject<typeof iconShape, 'strip', z.ZodTypeAny, IconDefinition>({
  shape: () => iconShape,
  unknownKeys: 'strip',
  catchall: z.never(),
  typeName: z.ZodFirstPartyTypeKind.ZodObject
})
