import { BadRequestException } from '@nestjs/common'
import { LanguagesEnum, RolesEnum } from '@xpert-ai/contracts'
import { RequestContext } from '@xpert-ai/plugin-sdk'
import { t } from 'i18next'
import { z } from 'zod/v3'

const profile = z
	.object({
		firstName: z.string().trim().max(100).nullable(),
		lastName: z.string().trim().max(100).nullable(),
		username: z.string().trim().min(1).max(100),
		imageUrl: z.string().max(2048).nullable(),
		preferredLanguage: z.nativeEnum(LanguagesEnum).nullable(),
		timeZone: z.string().max(100).nullable()
	})
	.partial()
	.strict()
const password = z.object({ hash: z.string().min(1).max(200), password: z.string().min(8).max(200) }).strict()

/** Account settings never carry role, organization, verification or password-hash changes. */
export function appUserProfile(input: unknown) {
	const parsed = profile.safeParse(input)
	if (!parsed.success) throw new BadRequestException(t('server-ai:Error.ApplicationProfileInvalid'))
	return parsed.data
}

export function validateAppUserPassword(input: unknown) {
	if (RequestContext.currentUser()?.role?.name !== RolesEnum.APP_USER) return
	if (!password.safeParse(input).success)
		throw new BadRequestException(t('server-ai:Error.ApplicationPasswordInvalid'))
}
