import { UserType } from '@xpert-ai/contracts'
import { z } from 'zod/v3'

export const userDirectoryQuerySchema = z
	.object({
		take: z.coerce.number().int().min(1).max(100).default(20),
		skip: z.coerce.number().int().min(0).max(Number.MAX_SAFE_INTEGER).default(0),
		search: z.string().trim().max(200).default(''),
		types: z.array(z.nativeEnum(UserType)).max(2).default([UserType.USER]),
		roles: z.array(z.string().min(1).max(100)).max(100).default([]),
		status: z.enum(['all', 'active', 'disabled']).default('all'),
		organizationIds: z.array(z.string().uuid()).max(100).default([])
	})
	.strict()

export type UserDirectoryQuery = z.output<typeof userDirectoryQuerySchema>
