import { PERSONAL_API_KEY_LIFETIMES } from '@xpert-ai/contracts'
import { z } from 'zod/v3'

export const personalApiKeyCreateSchema = z
	.object({
		name: z.string().trim().min(1).max(100),
		lifetime: z.enum(PERSONAL_API_KEY_LIFETIMES).default('90')
	})
	.strict()

export type PersonalApiKeyCreate = z.output<typeof personalApiKeyCreateSchema>
