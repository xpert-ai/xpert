import { ExecutionContextHost } from '@nestjs/core/helpers/execution-context-host'
import { Reflector } from '@nestjs/core'
import { CommandBus } from '@nestjs/cqrs'
import { Test } from '@nestjs/testing'
import { IUser } from '@xpert-ai/contracts'
import { applyTokenPermissionCeiling } from '../../auth/strategies/jwt-permissions'
import { RequestContext } from '@xpert-ai/plugin-sdk'
import { PermissionGuard } from './permission.guard'

describe('PermissionGuard current policy', () => {
	const execute = jest.fn()
	const getAllAndOverride = jest.fn()
	const context = new ExecutionContextHost([], PermissionGuard, () => {})
	let guard: PermissionGuard

	beforeEach(async () => {
		execute.mockReset()
		getAllAndOverride.mockReturnValue(['DATA_SOURCE_VIEW'])
		jest.spyOn(RequestContext, 'currentUser').mockReturnValue({
			id: 'user',
			tenantId: 'tenant',
			roleId: 'role',
			role: {
				rolePermissions: [{ tenantId: 'tenant', roleId: 'role', permission: 'DATA_SOURCE_VIEW', enabled: true }]
			}
		} as IUser)
		jest.spyOn(RequestContext, 'currentTenantId').mockReturnValue('tenant')
		jest.spyOn(RequestContext, 'currentRoleId').mockReturnValue('role')
		const module = await Test.createTestingModule({
			providers: [
				PermissionGuard,
				{ provide: Reflector, useValue: { getAllAndOverride } },
				{ provide: CommandBus, useValue: { execute } }
			]
		}).compile()
		guard = module.get(PermissionGuard)
	})
	afterEach(() => jest.restoreAllMocks())

	it('uses refreshed authentication grants on each request without additional database checks', async () => {
		for (const granted of [true, false, true]) {
			jest.mocked(RequestContext.currentUser).mockReturnValue({
				id: 'user',
				tenantId: 'tenant',
				roleId: 'role',
				role: {
					rolePermissions: [
						{ tenantId: 'tenant', roleId: 'role', permission: 'DATA_SOURCE_VIEW', enabled: granted }
					]
				}
			} as IUser)
			expect(await guard.canActivate(context)).toBe(granted)
		}
		expect(execute).not.toHaveBeenCalled()
	})

	it.each(['user', 'tenant', 'role'])('fails closed without %s context', async (missing) => {
		if (missing === 'user') jest.mocked(RequestContext.currentUser).mockReturnValue(null)
		if (missing === 'tenant') RequestContext.currentUser().tenantId = null
		if (missing === 'role') RequestContext.currentUser().roleId = null
		expect(await guard.canActivate(context)).toBe(false)
		expect(execute).not.toHaveBeenCalled()
	})

	it('skips permission checks for routes without required permissions', async () => {
		getAllAndOverride.mockReturnValue(undefined)
		expect(await guard.canActivate(context)).toBe(true)
		expect(execute).not.toHaveBeenCalled()
	})

	it.each([{ permissions: [] }, { permissions: ['DATA_SOURCE_EDIT'] }])(
		'does not bypass an explicit token ceiling %j',
		async ({ permissions }) => {
			applyTokenPermissionCeiling(RequestContext.currentUser(), permissions)
			execute.mockResolvedValue(true)
			expect(await guard.canActivate(context)).toBe(false)
			expect(execute).not.toHaveBeenCalled()
		}
	)

	it('does not grant an excluded OR alternative when the allowed permission has been revoked', async () => {
		getAllAndOverride.mockReturnValue(['DATA_SOURCE_VIEW', 'DATA_SOURCE_EDIT'])
		const user = RequestContext.currentUser()
		user.role.rolePermissions.push({
			tenantId: 'tenant',
			roleId: user.roleId,
			role: user.role,
			permission: 'DATA_SOURCE_EDIT',
			enabled: true
		})
		user.role.rolePermissions[0].enabled = false
		applyTokenPermissionCeiling(user, ['DATA_SOURCE_VIEW'])
		execute.mockResolvedValue(true)
		expect(await guard.canActivate(context)).toBe(false)
		expect(execute).not.toHaveBeenCalled()
	})

	it('preserves OR semantics when an eligible alternative is granted', async () => {
		getAllAndOverride.mockReturnValue(['DATA_SOURCE_EDIT', 'DATA_SOURCE_VIEW', 'DATA_SOURCE_VIEW'])
		execute.mockResolvedValue(true)
		expect(await guard.canActivate(context)).toBe(true)
		expect(execute).not.toHaveBeenCalled()
	})

	it('does not query or authorize a disabled authenticated grant', async () => {
		RequestContext.currentUser().role.rolePermissions[0].enabled = false
		execute.mockResolvedValue(true)
		expect(await guard.canActivate(context)).toBe(false)
		expect(execute).not.toHaveBeenCalled()
	})

	it.each([undefined, null])(
		'denies without widening grants when authentication leaves permissions %s',
		async (rolePermissions) => {
			jest.mocked(RequestContext.currentUser).mockReturnValue({
				id: 'user',
				tenantId: 'tenant',
				roleId: 'role',
				role: { rolePermissions }
			} as IUser)
			for (const granted of [true, false, true]) {
				execute.mockResolvedValue(granted)
				expect(await guard.canActivate(context)).toBe(false)
			}
			expect(execute).not.toHaveBeenCalled()
		}
	)

	it('rejects an explicit empty declaration', async () => {
		getAllAndOverride.mockReturnValue([])
		expect(await guard.canActivate(context)).toBe(false)
	})

	it('does not fall back to the database for loaded empty permissions', async () => {
		RequestContext.currentUser().role.rolePermissions = []
		execute.mockResolvedValue(true)
		expect(await guard.canActivate(context)).toBe(false)
		expect(execute).not.toHaveBeenCalled()
	})

	it.each([
		{ tenantId: 'another-tenant', roleId: 'role' },
		{ tenantId: 'tenant', roleId: 'another-role' },
		{ tenantId: undefined, roleId: undefined }
	])('rejects loaded grants outside the current tenant/role scope: %j', async (scope) => {
		Object.assign(RequestContext.currentUser().role.rolePermissions[0], scope)
		execute.mockResolvedValue(true)
		expect(await guard.canActivate(context)).toBe(false)
		expect(execute).not.toHaveBeenCalled()
	})

	it('does not share authorization between requests with the same role and different token limits', async () => {
		const first = RequestContext.currentUser()
		const restricted = { ...first }
		applyTokenPermissionCeiling(restricted, [])
		for (const [user, allowed] of [
			[first, true],
			[restricted, false],
			[first, true]
		] as const) {
			jest.mocked(RequestContext.currentUser).mockReturnValue(user)
			expect(await guard.canActivate(context)).toBe(allowed)
		}
		expect(execute).not.toHaveBeenCalled()
	})
})
