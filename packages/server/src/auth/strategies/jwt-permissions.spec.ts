import { ConfigService } from '@nestjs/config'
import { Test } from '@nestjs/testing'
import { IUser } from '@xpert-ai/contracts'
import { AuthService } from '../auth.service'
import { JwtStrategy } from './jwt.strategy'
import { WsJwtStrategy } from './ws-jwt.strategy'

jest.mock('../auth.service', () => ({ AuthService: class AuthService {} }))

describe.each([JwtStrategy, WsJwtStrategy])('%s current permissions', (Strategy) => {
	const getAuthenticatedUser = jest.fn()
	let strategy: JwtStrategy | WsJwtStrategy

	beforeEach(async () => {
		getAuthenticatedUser.mockReset()
		const module = await Test.createTestingModule({
			providers: [
				Strategy,
				{ provide: AuthService, useValue: { getAuthenticatedUser } },
				{ provide: ConfigService, useValue: { get: () => 'test-secret' } }
			]
		}).compile()
		strategy = module.get(Strategy)
	})

	it('ignores stale token grants and observes revocation and regrant with the same token', async () => {
		const payload = {
			id: 'user',
			thirdPartyId: 'sso-user',
			employeeId: 'employee',
			username: 'viewer',
			permissions: ['DATA_SOURCE_VIEW']
		}
		for (const enabled of [true, false, true]) {
			const user = {
				id: 'user',
				role: { name: 'FILE_ANALYTICS_VIEWER', rolePermissions: [{ permission: 'DATA_SOURCE_VIEW', enabled }] }
			} as IUser
			getAuthenticatedUser.mockResolvedValue(user)
			const done = jest.fn()
			await strategy.validate(payload, done)
			expect(getAuthenticatedUser).toHaveBeenLastCalledWith('user', 'sso-user')
			expect(done).toHaveBeenCalledWith(null, user)
			expect(user.role.rolePermissions).toEqual([{ permission: 'DATA_SOURCE_VIEW', enabled }])
		}
	})

	it('does not synthesize database permissions from JWT claims', async () => {
		const user = { id: 'user', role: { name: 'FILE_ANALYTICS_VIEWER' } } as IUser
		getAuthenticatedUser.mockResolvedValue(user)
		await strategy.validate(
			{ id: 'user', thirdPartyId: '', employeeId: '', username: '', permissions: ['DATA_SOURCE_VIEW'] },
			jest.fn()
		)
		expect(user.role.rolePermissions).toEqual([])
	})

	it('preserves explicit token permission limits, including an empty grant', async () => {
		for (const permissions of [['DATA_SOURCE_VIEW'], []]) {
			const user = {
				id: 'user',
				role: {
					rolePermissions: [
						{ permission: 'DATA_SOURCE_VIEW', enabled: true },
						{ permission: 'DATA_SOURCE_EDIT', enabled: true }
					]
				}
			} as IUser
			getAuthenticatedUser.mockResolvedValue(user)
			await strategy.validate(
				{ id: 'user', thirdPartyId: '', employeeId: '', username: '', permissions },
				jest.fn()
			)
			expect(user.role.rolePermissions.map((grant) => grant.permission)).toEqual(permissions)
		}
	})

	it.each([undefined, null])(
		'uses live permissions when an older token has a %s permission claim',
		async (permissions) => {
			const user = {
				id: 'user',
				role: { rolePermissions: [{ permission: 'DATA_SOURCE_VIEW', enabled: true }] }
			} as IUser
			getAuthenticatedUser.mockResolvedValue(user)
			await strategy.validate(
				{ id: 'user', thirdPartyId: '', employeeId: '', username: '', permissions },
				jest.fn()
			)
			expect(user.role.rolePermissions).toEqual([{ permission: 'DATA_SOURCE_VIEW', enabled: true }])
		}
	)

	it('does not retain a permission deleted from the role', async () => {
		const user = { id: 'user', role: { rolePermissions: [] } } as IUser
		getAuthenticatedUser.mockResolvedValue(user)
		await strategy.validate(
			{ id: 'user', thirdPartyId: '', employeeId: '', username: '', permissions: ['DATA_SOURCE_VIEW'] },
			jest.fn()
		)
		expect(user.role.rolePermissions).toEqual([])
	})

	it('does not mutate a shared role when applying a restricted token', async () => {
		const user = {
			id: 'user',
			role: { rolePermissions: [{ permission: 'DATA_SOURCE_VIEW', enabled: true }] }
		} as IUser
		const originalRole = user.role
		getAuthenticatedUser.mockResolvedValue(user)
		await strategy.validate(
			{ id: 'user', thirdPartyId: '', employeeId: '', username: '', permissions: [] },
			jest.fn()
		)
		expect(user.role.rolePermissions).toEqual([])
		expect(originalRole.rolePermissions).toEqual([{ permission: 'DATA_SOURCE_VIEW', enabled: true }])
	})
})
