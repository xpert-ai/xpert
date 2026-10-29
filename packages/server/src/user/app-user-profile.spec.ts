import { BadRequestException } from '@nestjs/common'
import { LanguagesEnum, RolesEnum } from '@xpert-ai/contracts'
import { RequestContext } from '@xpert-ai/plugin-sdk'
import { appUserProfile, validateAppUserPassword } from './app-user-profile'

describe('application user account settings', () => {
	afterEach(() => jest.restoreAllMocks())

	it('accepts the existing profile form and independent language changes', () => {
		const input = {
			firstName: ' Test ',
			lastName: null,
			username: 'tester',
			imageUrl: null,
			preferredLanguage: LanguagesEnum.English,
			timeZone: 'Asia/Shanghai'
		}
		expect(appUserProfile(input)).toEqual({ ...input, firstName: 'Test' })
		expect(appUserProfile({ preferredLanguage: LanguagesEnum.English })).toEqual({
			preferredLanguage: LanguagesEnum.English
		})
	})

	it.each(['roleId', 'role', 'tenantId', 'organizations', 'email', 'emailVerified', 'hash', 'type', 'isActive'])(
		'rejects protected account field %s',
		(field) => {
			expect(() => appUserProfile({ firstName: 'Test', [field]: 'unauthorized' })).toThrow(BadRequestException)
		}
	)

	it('requires current-password proof and rejects unrelated password fields', () => {
		jest.spyOn(RequestContext, 'currentUser').mockReturnValue({ role: { name: RolesEnum.APP_USER } })
		expect(() => validateAppUserPassword({ password: 'new-password' })).toThrow(BadRequestException)
		expect(() =>
			validateAppUserPassword({ hash: 'old-password', password: 'new-password', role: 'ADMIN' })
		).toThrow(BadRequestException)
		expect(() => validateAppUserPassword({ hash: 'old-password', password: 'new-password' })).not.toThrow()
	})
})
