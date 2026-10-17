import { Test } from '@nestjs/testing'
import { getRepositoryToken } from '@nestjs/typeorm'
import { RequestContext } from '@xpert-ai/plugin-sdk'
import { UserType } from '@xpert-ai/contracts'
import { User } from '../../user.entity'
import { ResolveRuntimeUserHandler } from './resolve-runtime-user.handler'
import { ResolveRuntimeUserCommand } from '../resolve-runtime-user.command'

describe('Restore authenticated worker user', () => {
	afterEach(() => jest.restoreAllMocks())
	it('loads current permissions, checks active membership and returns no credentials', async () => {
		jest.spyOn(RequestContext, 'currentTenantId').mockReturnValue('tenant')
		jest.spyOn(RequestContext, 'currentUserId').mockReturnValue('viewer')
		jest.spyOn(RequestContext, 'getOrganizationId').mockReturnValue('org')
		const user = {
			id: 'viewer',
			tenantId: 'tenant',
			type: UserType.USER,
			roleId: 'role',
			role: { id: 'role', rolePermissions: [{ permission: 'DATA_SOURCE_VIEW', enabled: true }] },
			organizations: [{ tenantId: 'tenant', organizationId: 'org', isActive: true }],
			hash: 'secret'
		}
		const findOne = jest.fn().mockResolvedValue(user)
		const module = await Test.createTestingModule({
			providers: [ResolveRuntimeUserHandler, { provide: getRepositoryToken(User), useValue: { findOne } }]
		}).compile()
		try {
			const handler = module.get(ResolveRuntimeUserHandler),
				command = new ResolveRuntimeUserCommand('tenant', 'viewer', 'org')
			expect(await handler.execute(command)).toEqual({
				id: 'viewer',
				tenantId: 'tenant',
				type: UserType.USER,
				roleId: 'role',
				role: user.role
			})
			user.role.rolePermissions[0].enabled = false
			expect((await handler.execute(command)).role?.rolePermissions?.[0].enabled).toBe(false)
			user.organizations[0].isActive = false
			await expect(handler.execute(command)).rejects.toMatchObject({ status: 403 })
			await expect(
				handler.execute(new ResolveRuntimeUserCommand('other', 'viewer', 'org'))
			).rejects.toMatchObject({ status: 403 })
			findOne.mockResolvedValue({ ...user, type: UserType.COMMUNICATION })
			await expect(handler.execute(command)).rejects.toMatchObject({ status: 403 })
			expect(findOne.mock.calls[0][0].where).toEqual({ id: 'viewer', tenantId: 'tenant' })
		} finally {
			await module.close()
		}
	})
})
