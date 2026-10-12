import { HttpException } from '@nestjs/common'
import { AIPermissionsEnum, IUser, RolesEnum } from '@xpert-ai/contracts'
import { RequestContext } from './request-context'

describe('RequestContext permission membership', () => {
	const view = AIPermissionsEnum.XPERT_PROJECT_VIEW
	const edit = AIPermissionsEnum.XPERT_PROJECT_EDIT

	beforeEach(() => {
		const user = {
			id: 'user-1',
			tenantId: 'tenant-1',
			role: {
				name: RolesEnum.ADMIN,
				rolePermissions: [
					{ permission: view, enabled: true },
					{ permission: view, enabled: true },
					{ permission: edit, enabled: false }
				]
			}
		} as IUser
		jest.spyOn(RequestContext, 'currentUser').mockReturnValue(user)
	})

	afterEach(() => jest.restoreAllMocks())

	it('accepts an enabled permission even when multiple records grant it', () => {
		expect(RequestContext.hasPermission(view)).toBe(true)
		expect(RequestContext.hasPermissions([view], true)).toBe(true)
	})

	it('does not count duplicate grants as a different required permission', () => {
		expect(RequestContext.hasPermissions([view, edit])).toBe(false)
		expect(() => RequestContext.hasPermissions([view, edit], true)).toThrow(HttpException)
	})

	it('treats repeated requirements as the same permission', () => {
		expect(RequestContext.hasPermissions([view, view, view])).toBe(true)
	})

	it('fails closed without authenticated role permissions', () => {
		jest.mocked(RequestContext.currentUser).mockReturnValue({ id: 'user-1' } as IUser)
		expect(RequestContext.hasPermission(view)).toBe(false)
		expect(() => RequestContext.hasPermissions([view], true)).toThrow(HttpException)
	})
})
