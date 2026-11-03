import { CommandBus, CqrsModule } from '@nestjs/cqrs'
import { Test } from '@nestjs/testing'
import { getRepositoryToken } from '@nestjs/typeorm'
import { AIPermissionsEnum, RolesEnum, UserType } from '@xpert-ai/contracts'
import { RequestContext } from '@xpert-ai/plugin-sdk'
import { RequestContext as LegacyContext } from '../../core/context/request-context'
import { User } from '../user.entity'
import { UserOrganization } from '../../user-organization/user-organization.entity'
import { Organization } from '../../organization/organization.entity'
import { ResolveUserOrganizationAccessHandler } from '../../user-organization/commands/handlers/resolve-user-organization-access.handler'
import { ExecutionUserLoader } from './execution-user-loader'
import { ResolveExecutionIdentityHandler } from './resolve-execution-identity.handler'
import { ResolveExecutionIdentityCommand } from './resolve-execution-identity.command'
import { ResolvedExecutionIdentity, runWithExecutionIdentity } from './execution-identity'

describe('Execution identity boundary', () => {
	async function fixture() {
		const user = {
			id: 'user',
			tenantId: 'tenant',
			type: UserType.USER,
			isActive: true,
			roleId: 'role',
			hash: 'never-copy',
			role: {
				id: 'role',
				tenantId: 'tenant',
				name: RolesEnum.AI_BUILDER,
				rolePermissions: [
					{ roleId: 'role', tenantId: 'tenant', permission: AIPermissionsEnum.XPERT_VIEW, enabled: true }
				]
			}
		}
		const users = { findOne: jest.fn().mockResolvedValue(user) }
		const memberships = { findOne: jest.fn().mockResolvedValue({ isActive: true }) }
		const module = await Test.createTestingModule({
			imports: [CqrsModule],
			providers: [
				ExecutionUserLoader,
				ResolveExecutionIdentityHandler,
				ResolveUserOrganizationAccessHandler,
				{ provide: getRepositoryToken(User), useValue: users },
				{ provide: getRepositoryToken(UserOrganization), useValue: memberships },
				{
					provide: getRepositoryToken(Organization),
					useValue: { findOne: jest.fn().mockResolvedValue({ id: 'org' }) }
				}
			]
		}).compile()
		await module.init()
		const ref = { kind: 'user' as const, userId: 'user', tenantId: 'tenant', organizationId: 'org' }
		return {
			module,
			user,
			users,
			memberships,
			ref,
			resolve: () => module.get(CommandBus).execute(new ResolveExecutionIdentityCommand(ref))
		}
	}

	it('dispatches across CQRS, loads permissions and excludes credentials in both contexts', async () => {
		const f = await fixture()
		try {
			const identity = await f.resolve()
			expect(identity.user).not.toHaveProperty('hash')
			await runWithExecutionIdentity(identity, async () => {
				expect(RequestContext.currentUserId()).toBe('user')
				expect(LegacyContext.currentUserId()).toBe('user')
				expect(RequestContext.getOrganizationId()).toBe('org')
				expect(RequestContext.hasPermission(AIPermissionsEnum.XPERT_VIEW)).toBe(true)
				expect(LegacyContext.hasPermission(AIPermissionsEnum.XPERT_VIEW)).toBe(true)
			})
			expect(RequestContext.currentUserId()).toBeNull()
			expect(f.users.findOne).toHaveBeenCalledWith(
				expect.objectContaining({
					where: { id: 'user', tenantId: 'tenant' },
					relations: expect.arrayContaining(['role.rolePermissions'])
				})
			)
		} finally {
			await f.module.close()
		}
	})

	it('refreshes revoked permissions and membership for each execution', async () => {
		const f = await fixture()
		try {
			await f.resolve()
			f.user.role.rolePermissions[0].enabled = false
			await runWithExecutionIdentity(await f.resolve(), async () => {
				expect(RequestContext.hasPermission(AIPermissionsEnum.XPERT_VIEW)).toBe(false)
			})
			f.memberships.findOne.mockResolvedValue(null)
			await expect(f.resolve()).rejects.toMatchObject({ response: { code: 'execution_identity_unavailable' } })
		} finally {
			await f.module.close()
		}
	})

	it.each(['inactive', 'wrong-tenant', 'wrong-kind', 'missing-grants'])(
		'rejects %s without entering the context',
		async (kind) => {
			const f = await fixture()
			try {
				if (kind === 'inactive') f.user.isActive = false
				if (kind === 'wrong-tenant') f.user.tenantId = 'other'
				if (kind === 'wrong-kind')
					f.users.findOne.mockResolvedValue({ ...f.user, type: UserType.COMMUNICATION })
				if (kind === 'missing-grants')
					f.users.findOne.mockResolvedValue({ ...f.user, role: { name: RolesEnum.SUPER_ADMIN } })
				await expect(f.resolve()).rejects.toThrow()
			} finally {
				await f.module.close()
			}
		}
	)

	it('accepts an explicitly loaded empty grant list and fails closed for serialized identities', async () => {
		const f = await fixture()
		try {
			f.user.role.rolePermissions = []
			const identity = await f.resolve()
			await runWithExecutionIdentity(identity, async () => {
				expect(RequestContext.hasPermission(AIPermissionsEnum.XPERT_VIEW)).toBe(false)
			})
			await expect(
				runWithExecutionIdentity(JSON.parse(JSON.stringify(identity)) as ResolvedExecutionIdentity, () => 1)
			).rejects.toMatchObject({ response: { code: 'execution_identity_incomplete' } })
		} finally {
			await f.module.close()
		}
	})

	it('isolates concurrent tenant scopes across awaited work', async () => {
		const f = await fixture()
		try {
			const first = await f.resolve()
			f.user.id = 'second'
			f.ref.userId = 'second'
			f.ref.organizationId = 'org-2'
			const second = await f.resolve()
			await Promise.all(
				[first, second].map((identity) =>
					runWithExecutionIdentity(identity, async () => {
						await new Promise((resolve) => setImmediate(resolve))
						expect(RequestContext.currentUserId()).toBe(identity.scope.userId)
						expect(LegacyContext.getOrganizationId()).toBe(identity.scope.organizationId)
					})
				)
			)
		} finally {
			await f.module.close()
		}
	})
	it('rejects an ordinary user object at both the type and runtime boundary', async () => {
		const task = jest.fn()
		await expect(
			runWithExecutionIdentity(
				// @ts-expect-error Only the resolver can supply the branded identity contract.
				{ user: { id: 'user' }, scope: { tenantId: 'tenant', userId: 'user', kind: 'user' } },
				task
			)
		).rejects.toThrow()
		expect(task).not.toHaveBeenCalled()
	})
})
