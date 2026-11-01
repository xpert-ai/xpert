import { BadRequestException } from '@nestjs/common'
import { LanguagesEnum, RolesEnum } from '@xpert-ai/contracts'
import { RequestContext } from '@xpert-ai/plugin-sdk'
import { selfUserProfile, validateSelfUserPassword } from './self-user-profile'

describe('role-independent account settings', () => {
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
		expect(selfUserProfile(input)).toEqual({ ...input, firstName: 'Test' })
		expect(selfUserProfile({ preferredLanguage: LanguagesEnum.English })).toEqual({
			preferredLanguage: LanguagesEnum.English
		})
	})

	it.each(['roleId', 'role', 'tenantId', 'organizations', 'email', 'emailVerified', 'hash', 'type', 'isActive'])(
		'rejects protected account field %s',
		(field) => {
			expect(() => selfUserProfile({ firstName: 'Test', [field]: 'unauthorized' })).toThrow(BadRequestException)
		}
	)

	it.each([RolesEnum.APP_USER, RolesEnum.ADMIN, RolesEnum.TRIAL, 'BID_CUSTOMER'])(
		'requires current-password proof and rejects unrelated password fields for %s',
		(name) => {
			jest.spyOn(RequestContext, 'currentUser').mockReturnValue({ role: { name } })
			expect(() => validateSelfUserPassword({ password: 'new-password' })).toThrow(BadRequestException)
			expect(() =>
				validateSelfUserPassword({ hash: 'old-password', password: 'new-password', role: 'ADMIN' })
			).toThrow(BadRequestException)
			expect(() => validateSelfUserPassword({ hash: 'old-password', password: 'new-password' })).not.toThrow()
		}
	)
})
