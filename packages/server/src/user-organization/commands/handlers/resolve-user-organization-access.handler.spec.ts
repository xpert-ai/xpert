import { Injectable, Module } from '@nestjs/common'
import { CommandBus, CqrsModule } from '@nestjs/cqrs'
import { Test } from '@nestjs/testing'
import { getRepositoryToken } from '@nestjs/typeorm'
import { RolesEnum, UserType } from '@xpert-ai/contracts'
import { Organization } from '../../../organization/organization.entity'
import { User } from '../../../user/user.entity'
import { UserOrganization } from '../../user-organization.entity'
import { ResolveUserOrganizationAccessCommand } from '../resolve-user-organization-access.command'
import { ResolveUserOrganizationAccessHandler } from './resolve-user-organization-access.handler'

@Injectable()
class AccessConsumer {
	constructor(private readonly commandBus: CommandBus) {}

	resolve(input: ResolveUserOrganizationAccessCommand['input']) {
		return this.commandBus.execute(new ResolveUserOrganizationAccessCommand(input))
	}
}

@Module({ imports: [CqrsModule], providers: [AccessConsumer] })
class ConsumerModule {}

@Module({})
class AccessOwnerModule {}

describe('ResolveUserOrganizationAccessHandler', () => {
	const scope = { tenantId: 'tenant', organizationId: 'org', userId: 'user' }

	function setup(role: RolesEnum = RolesEnum.ADMIN) {
		const user = { id: scope.userId, tenantId: scope.tenantId, type: UserType.USER, role: { name: role } }
		const users = { findOne: jest.fn().mockResolvedValue(user) }
		const memberships = { findOne: jest.fn().mockResolvedValue({ isActive: true }) }
		const organizations = { findOne: jest.fn().mockResolvedValue({ id: scope.organizationId }) }
		const service = new ResolveUserOrganizationAccessHandler(
			users as never,
			memberships as never,
			organizations as never
		)
		return { service, user, users, memberships, organizations }
	}

	it.each(['tenantId', 'organizationId', 'userId'] as const)('rejects an empty %s before querying', async (field) => {
		const f = setup()
		for (const value of [undefined, null, '', '   ']) {
			await expect(
				f.service.execute(new ResolveUserOrganizationAccessCommand({ ...scope, [field]: value }))
			).resolves.toBeNull()
		}
		expect(f.users.findOne).not.toHaveBeenCalled()
		expect(f.memberships.findOne).not.toHaveBeenCalled()
		expect(f.organizations.findOne).not.toHaveBeenCalled()
	})

	it.each([
		['missing', null],
		['communication', { type: UserType.COMMUNICATION, role: { name: RolesEnum.SUPER_ADMIN } }],
		['untyped', { role: { name: RolesEnum.SUPER_ADMIN } }]
	])('rejects a %s user even with a claimed privileged role', async (_label, user) => {
		const f = setup()
		f.users.findOne.mockResolvedValueOnce(user)
		await expect(f.service.execute(new ResolveUserOrganizationAccessCommand(scope))).resolves.toBeNull()
		expect(f.users.findOne).toHaveBeenCalledWith({
			where: { id: scope.userId, tenantId: scope.tenantId },
			relations: ['role']
		})
		expect(f.memberships.findOne).not.toHaveBeenCalled()
		expect(f.organizations.findOne).not.toHaveBeenCalled()
	})

	it('requires active membership and an active organization in the same tenant for ordinary users', async () => {
		const f = setup()
		await expect(f.service.execute(new ResolveUserOrganizationAccessCommand(scope))).resolves.toBe(f.user)
		expect(f.memberships.findOne).toHaveBeenCalledWith({
			where: { ...scope, isActive: true, organization: { tenantId: scope.tenantId, isActive: true } }
		})
		f.memberships.findOne.mockResolvedValueOnce(null)
		await expect(f.service.execute(new ResolveUserOrganizationAccessCommand(scope))).resolves.toBeNull()
		expect(f.organizations.findOne).not.toHaveBeenCalled()
	})

	it('treats users without a role as ordinary members', async () => {
		const f = setup()
		f.users.findOne.mockResolvedValue({ ...f.user, role: null })
		await expect(f.service.execute(new ResolveUserOrganizationAccessCommand(scope))).resolves.toMatchObject({
			id: scope.userId
		})
		f.memberships.findOne.mockResolvedValueOnce(null)
		await expect(f.service.execute(new ResolveUserOrganizationAccessCommand(scope))).resolves.toBeNull()
		expect(f.organizations.findOne).not.toHaveBeenCalled()
	})

	it('allows SUPER_ADMIN without a membership only for an active organization in the same tenant', async () => {
		const f = setup(RolesEnum.SUPER_ADMIN)
		f.memberships.findOne.mockResolvedValue(null)
		await expect(f.service.execute(new ResolveUserOrganizationAccessCommand(scope))).resolves.toBe(f.user)
		expect(f.organizations.findOne).toHaveBeenCalledWith({
			where: { id: scope.organizationId, tenantId: scope.tenantId, isActive: true }
		})
		f.organizations.findOne.mockResolvedValueOnce(null)
		await expect(f.service.execute(new ResolveUserOrganizationAccessCommand(scope))).resolves.toBeNull()
		expect(f.memberships.findOne).not.toHaveBeenCalled()
	})

	it('rechecks the live role after a downgrade instead of reusing a previous decision', async () => {
		const f = setup(RolesEnum.SUPER_ADMIN)
		f.memberships.findOne.mockResolvedValue(null)
		await expect(f.service.execute(new ResolveUserOrganizationAccessCommand(scope))).resolves.toBe(f.user)
		f.users.findOne.mockResolvedValueOnce({ ...f.user, role: { name: RolesEnum.ADMIN } })
		await expect(f.service.execute(new ResolveUserOrganizationAccessCommand(scope))).resolves.toBeNull()
		expect(f.users.findOne).toHaveBeenCalledTimes(2)
		expect(f.memberships.findOne).toHaveBeenCalledTimes(1)
		expect(f.organizations.findOne).toHaveBeenCalledTimes(1)
	})

	it('uses only identity fields from a richer invocation scope', async () => {
		const f = setup()
		const invocationScope = { ...scope, workspaceId: 'workspace', parentExecutionId: 'execution' }
		await f.service.execute(new ResolveUserOrganizationAccessCommand(invocationScope))
		expect(f.users.findOne).toHaveBeenCalledWith({ where: { id: 'user', tenantId: 'tenant' }, relations: ['role'] })
		expect(f.memberships.findOne).toHaveBeenCalledWith({
			where: { ...scope, isActive: true, organization: { tenantId: 'tenant', isActive: true } }
		})
	})

	it('propagates storage errors instead of reporting an access denial', async () => {
		const f = setup()
		const error = new Error('storage unavailable')
		f.users.findOne.mockRejectedValueOnce(error)
		await expect(f.service.execute(new ResolveUserOrganizationAccessCommand(scope))).rejects.toBe(error)
	})

	it('dispatches across module boundaries with only CommandBus injected into the consumer', async () => {
		const f = setup(RolesEnum.SUPER_ADMIN)
		f.memberships.findOne.mockResolvedValue(null)
		const module = await Test.createTestingModule({
			imports: [
				ConsumerModule,
				{
					module: AccessOwnerModule,
					imports: [CqrsModule],
					providers: [
						ResolveUserOrganizationAccessHandler,
						{ provide: getRepositoryToken(User), useValue: f.users },
						{ provide: getRepositoryToken(UserOrganization), useValue: f.memberships },
						{ provide: getRepositoryToken(Organization), useValue: f.organizations }
					]
				}
			]
		}).compile()
		try {
			await module.init()
			await expect(module.get(AccessConsumer).resolve(scope)).resolves.toBe(f.user)
			f.organizations.findOne.mockResolvedValueOnce(null)
			await expect(module.get(AccessConsumer).resolve(scope)).resolves.toBeNull()
		} finally {
			await module.close()
		}
	})
})
