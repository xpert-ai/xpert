import { z } from 'zod/v3'
import { BUSINESS_AREA_ACCESS_ROLES } from '@xpert-ai/contracts'
import { BadRequestException } from '@nestjs/common'
import { t } from 'i18next'
import { ZodValidationPipe } from '../../shared/pipes/zod-validation.pipe'

export const businessAreaGrantSchema = z.discriminatedUnion('subjectType', [
	z
		.object({ subjectType: z.literal('user'), userId: z.string().uuid(), role: z.enum(BUSINESS_AREA_ACCESS_ROLES) })
		.strict(),
	z
		.object({
			subjectType: z.literal('user_group'),
			userGroupId: z.string().uuid(),
			role: z.enum(BUSINESS_AREA_ACCESS_ROLES)
		})
		.strict()
])
export const businessAreaAccessQuerySchema = z.object({ userId: z.string().uuid().optional() }).strict()
export function businessAreaAccessPipe<T>(schema: z.ZodType<T, z.ZodTypeDef, unknown>) {
	return new ZodValidationPipe(schema, () => new BadRequestException(t('server-ai:Error.BusinessAreaInvalidSubject')))
}
