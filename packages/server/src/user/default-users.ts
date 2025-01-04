import { LanguagesEnum } from '@metad/contracts'

export const EMAIL_ADDRESS = '@mtda.cloud'

export const DEFAULT_SUPER_ADMINS = [
	{
		email: `admin${EMAIL_ADDRESS}`,
		password: 'admin',
		firstName: 'Super',
		lastName: 'Admin',
		imageUrl: 'assets/images/avatar-default.svg',
		preferredLanguage: LanguagesEnum.Chinese,
	}
]

export const DEFAULT_ADMINS = [
	{
		email: `local.admin${EMAIL_ADDRESS}`,
		password: 'admin',
		firstName: 'Local',
		lastName: 'Admin',
		imageUrl: 'assets/images/avatar-default.svg',
		preferredLanguage: LanguagesEnum.Chinese,
	}
]
