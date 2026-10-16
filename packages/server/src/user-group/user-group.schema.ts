import { BadRequestException } from '@nestjs/common'
import { t } from 'i18next'
import { z } from 'zod/v3'
import { ZodValidationPipe } from '../shared/pipes/zod-validation.pipe'

export const userGroupMemberIdsSchema = z.array(z.string().uuid())
export const userGroupCreateSchema = z.object({
	name: z.string().trim().min(1).max(100),
	description: z.string().nullable().optional(),
	members: z.array(z.object({ id: z.string().uuid() })).optional()
})
export const userGroupUpdateSchema = userGroupCreateSchema.partial()

export type UserGroupCreateInput = z.output<typeof userGroupCreateSchema>
export type UserGroupUpdateInput = z.output<typeof userGroupUpdateSchema>

export function userGroupValidationPipe<T>(schema: z.ZodType<T, z.ZodTypeDef, unknown>) {
	return new ZodValidationPipe(
		schema,
		() =>
			new BadRequestException(
				t('server-ai:Error.InvalidUserGroupInput', { defaultValue: 'Invalid user group input.' })
			)
	)
}
