import { ConflictException } from '@nestjs/common'
import { UserType } from '@xpert-ai/contracts'

jest.mock('../core/context', () => ({
	RequestContext: {
		currentUserId: jest.fn()
	}
}))

const { RequestContext } = require('../core/context')
const { AccountBindingService } = require('./account-binding.service')
const { ExternalIdentityBinding } = require('./external-identity-binding.entity')
const { User } = require('../user/user.entity')

type UserRecord = {
	id: string
	tenantId: string
	type?: UserType
	thirdPartyId?: string | null
	hash?: string | null
	role?: Record<string, any>
	employee?: Record<string, any>
}

type BindingRecord = {
	id?: string
	tenantId: string
	provider: string
	subjectId: string
	userId: string
	profile?: Record<string, any> | null
	createdAt?: Date
	updatedAt?: Date
}

function cloneUser(user: UserRecord): UserRecord {
	return {
		...user,
		hash:
			user.hash === undefined
				? user.type === UserType.COMMUNICATION
					? null
					: 'hashed-password'
				: user.hash,
		role: user.role
			? {
					...user.role,
					rolePermissions: [...(user.role.rolePermissions ?? [])]
				}
			: user.role,
		employee: user.employee ? { ...user.employee } : user.employee
	}
}

function cloneBinding(binding: BindingRecord): BindingRecord {
	return {
		...binding,
		profile: binding.profile ? { ...binding.profile } : binding.profile,
		createdAt: binding.createdAt ? new Date(binding.createdAt) : binding.createdAt,
		updatedAt: binding.updatedAt ? new Date(binding.updatedAt) : binding.updatedAt
	}
}

function matchesWhere(record: Record<string, any>, where: Record<string, any>) {
	return Object.entries(where).every(([key, value]) => record[key] === value)
}

function createHarness(input?: { users?: UserRecord[]; bindings?: BindingRecord[] }) {
	const users = (input?.users ?? []).map(cloneUser)
	const bindings = (input?.bindings ?? []).map(cloneBinding)
	let bindingSequence = bindings.length + 1

	const userRepository = {
		findOne: jest.fn(async ({ where }: { where: Record<string, any> }) => {
			const user = users.find((item) => matchesWhere(item as any, where))
			return user ? cloneUser(user) : null
		}),
		save: jest.fn(async (entity: UserRecord) => {
			const index = users.findIndex((item) => item.id === entity.id)
			const value = cloneUser(entity)
			if (index >= 0) {
				users[index] = value
			} else {
				users.push(value)
			}
			return cloneUser(value)
		}),
		create: jest.fn((entity: UserRecord) => cloneUser(entity))
	}

	const bindingRepository = {
		findOne: jest.fn(async ({ where }: { where: Record<string, any> }) => {
			const binding = bindings.find((item) => matchesWhere(item as any, where))
			return binding ? cloneBinding(binding) : null
		}),
		create: jest.fn((entity: BindingRecord) => cloneBinding(entity)),
		save: jest.fn(async (entity: BindingRecord) => {
			const now = new Date(`2026-04-14T00:00:0${bindingSequence % 10}.000Z`)
			const index = entity.id
				? bindings.findIndex((item) => item.id === entity.id)
				: -1
			const value = cloneBinding({
				...entity,
				id: entity.id ?? `binding-${bindingSequence++}`,
				createdAt:
					index >= 0 ? bindings[index].createdAt : entity.createdAt ?? now,
				updatedAt: now
			})
			if (index >= 0) {
				bindings[index] = value
			} else {
				bindings.push(value)
			}
			return cloneBinding(value)
		}),
		remove: jest.fn(async (entity: BindingRecord) => {
			const index = bindings.findIndex((item) => item.id === entity.id)
			if (index >= 0) {
				bindings.splice(index, 1)
			}
			return cloneBinding(entity)
		}),
		manager: {
			transaction: jest.fn(async (callback: (manager: any) => Promise<any>) => {
				const userSnapshot = users.map(cloneUser)
				const bindingSnapshot = bindings.map(cloneBinding)
				try {
					return await callback(manager)
				} catch (error) {
					users.splice(0, users.length, ...userSnapshot.map(cloneUser))
					bindings.splice(0, bindings.length, ...bindingSnapshot.map(cloneBinding))
					throw error
				}
			})
		}
	}

	const manager = {
		getRepository: jest.fn((entity: unknown) => {
			if (entity === User) {
				return userRepository
			}
			if (entity === ExternalIdentityBinding) {
				return bindingRepository
			}
			throw new Error(`Unsupported repository: ${String(entity)}`)
		})
	}

	const service = new AccountBindingService(bindingRepository as any, userRepository as any)

	return {
		service,
		users,
		bindings,
		userRepository,
		bindingRepository
	}
}

describe('AccountBindingService', () => {
	beforeEach(() => {
		jest.clearAllMocks()
		RequestContext.currentUserId.mockReturnValue('actor-1')
	})

	it('creates a binding on first bind', async () => {
		const { service, bindings } = createHarness({
			users: [{ id: 'user-1', tenantId: 'tenant-1', type: UserType.USER }]
		})

		const binding = await service.bindUser({
			tenantId: 'tenant-1',
			userId: 'user-1',
			provider: 'github',
			subjectId: 'subject-1',
			profile: { nick: 'alice' }
		})

		expect(binding).toEqual(
			expect.objectContaining({
				tenantId: 'tenant-1',
				userId: 'user-1',
				provider: 'github',
				subjectId: 'subject-1',
				profile: { nick: 'alice' }
			})
		)
		expect(bindings).toHaveLength(1)
	})

	it('treats rebinding the same subject for the same user as idempotent and updates profile', async () => {
		const { service, bindings } = createHarness({
			users: [{ id: 'user-1', tenantId: 'tenant-1', type: UserType.USER }],
			bindings: [
				{
					id: 'binding-1',
					tenantId: 'tenant-1',
					userId: 'user-1',
					provider: 'github',
					subjectId: 'subject-1',
					profile: { nick: 'old' },
					createdAt: new Date('2026-04-13T00:00:00.000Z'),
					updatedAt: new Date('2026-04-13T00:00:00.000Z')
				}
			]
		})

		const binding = await service.bindUser({
			tenantId: 'tenant-1',
			userId: 'user-1',
			provider: 'github',
			subjectId: 'subject-1',
			profile: { nick: 'new' }
		})

		expect(binding.id).toBe('binding-1')
		expect(bindings).toHaveLength(1)
		expect(bindings[0].profile).toEqual({ nick: 'new' })
	})

	it('replaces the old subject when the same user rebinds within the same provider', async () => {
		const { service, bindings } = createHarness({
			users: [{ id: 'user-1', tenantId: 'tenant-1', type: UserType.USER }],
			bindings: [
				{
					id: 'binding-1',
					tenantId: 'tenant-1',
					userId: 'user-1',
					provider: 'github',
					subjectId: 'subject-old',
					profile: { nick: 'old' }
				}
			]
		})

		await service.bindUser({
			tenantId: 'tenant-1',
			userId: 'user-1',
			provider: 'github',
			subjectId: 'subject-new',
			profile: { nick: 'new' }
		})

		expect(bindings).toHaveLength(1)
		expect(bindings[0]).toEqual(
			expect.objectContaining({
				id: 'binding-1',
				subjectId: 'subject-new',
				profile: { nick: 'new' }
			})
		)
	})

	it('rejects a subject that is already bound to another user in the same tenant', async () => {
		const { service, bindings } = createHarness({
			users: [
				{ id: 'user-1', tenantId: 'tenant-1', type: UserType.USER },
				{ id: 'user-2', tenantId: 'tenant-1', type: UserType.USER }
			],
			bindings: [
				{
					id: 'binding-1',
					tenantId: 'tenant-1',
					userId: 'user-2',
					provider: 'github',
					subjectId: 'subject-1'
				}
			]
		})

		await expect(
			service.bindUser({
				tenantId: 'tenant-1',
				userId: 'user-1',
				provider: 'github',
				subjectId: 'subject-1'
			})
		).rejects.toBeInstanceOf(ConflictException)
		expect(bindings).toHaveLength(1)
	})

	it('removes an existing binding and clears the lark compatibility field when needed', async () => {
		const { service, bindings, users } = createHarness({
			users: [
				{
					id: 'user-1',
					tenantId: 'tenant-1',
					type: UserType.USER,
					thirdPartyId: 'union-1'
				}
			],
			bindings: [
				{
					id: 'binding-1',
					tenantId: 'tenant-1',
					userId: 'user-1',
					provider: 'lark',
					subjectId: 'union-1'
				}
			]
		})

		await service.unbindUser({
			tenantId: 'tenant-1',
			userId: 'user-1',
			provider: 'lark'
		})

		expect(bindings).toHaveLength(0)
		expect(users[0].thirdPartyId).toBeNull()
	})

	it('treats unbinding a missing record as a silent success', async () => {
		const { service, bindings } = createHarness({
			users: [{ id: 'user-1', tenantId: 'tenant-1', type: UserType.USER }]
		})

		await expect(
			service.unbindUser({
				tenantId: 'tenant-1',
				userId: 'user-1',
				provider: 'github'
			})
		).resolves.toBeUndefined()
		expect(bindings).toHaveLength(0)
	})

	it('syncs lark bindings into user.thirdPartyId', async () => {
		const { service, users } = createHarness({
			users: [{ id: 'user-1', tenantId: 'tenant-1', type: UserType.USER }]
		})

		await service.bindUser({
			tenantId: 'tenant-1',
			userId: 'user-1',
			provider: 'lark',
			subjectId: 'union-1'
		})

		expect(users[0].thirdPartyId).toBe('union-1')
	})

	it('reclaims a lark thirdPartyId from a communication user before syncing to the real user', async () => {
		const { service, users } = createHarness({
			users: [
				{ id: 'user-1', tenantId: 'tenant-1', type: UserType.USER },
				{
					id: 'comm-1',
					tenantId: 'tenant-1',
					type: UserType.COMMUNICATION,
					thirdPartyId: 'union-1'
				}
			]
		})

		await service.bindUser({
			tenantId: 'tenant-1',
			userId: 'user-1',
			provider: 'lark',
			subjectId: 'union-1'
		})

		expect(users.find((item) => item.id === 'user-1')?.thirdPartyId).toBe('union-1')
		expect(users.find((item) => item.id === 'comm-1')?.thirdPartyId).toBeNull()
	})

	it('returns null when no binding exists even if a legacy thirdPartyId remains on a ghost user', async () => {
		const { service } = createHarness({
			users: [
				{
					id: 'ghost-1',
					tenantId: 'tenant-1',
					type: UserType.USER,
					hash: null,
					thirdPartyId: 'union-1'
				}
			]
		})

		const user = await service.resolveUser({
			tenantId: 'tenant-1',
			provider: 'lark',
			subjectId: 'union-1'
		})

		expect(user).toBeNull()
	})

	it('returns null when no binding exists even if a legacy thirdPartyId remains on a real user', async () => {
		const { service } = createHarness({
			users: [
				{
					id: 'user-1',
					tenantId: 'tenant-1',
					type: UserType.USER,
					hash: 'hashed-password',
					thirdPartyId: 'union-1',
					role: { id: 'role-1', rolePermissions: [{ id: 'perm-1' }] },
					employee: { id: 'employee-1' }
				}
			]
		})

		const user = await service.resolveUser({
			tenantId: 'tenant-1',
			provider: 'lark',
			subjectId: 'union-1'
		})

		expect(user).toBeNull()
	})

	it('reclaims a lark thirdPartyId from a ghost user before syncing to the real user', async () => {
		const { service, users } = createHarness({
			users: [
				{ id: 'user-1', tenantId: 'tenant-1', type: UserType.USER, hash: 'hashed-password' },
				{
					id: 'ghost-1',
					tenantId: 'tenant-1',
					type: UserType.USER,
					hash: null,
					thirdPartyId: 'union-1'
				}
			]
		})

		await service.bindUser({
			tenantId: 'tenant-1',
			userId: 'user-1',
			provider: 'lark',
			subjectId: 'union-1'
		})

		expect(users.find((item) => item.id === 'user-1')?.thirdPartyId).toBe('union-1')
		expect(users.find((item) => item.id === 'ghost-1')?.thirdPartyId).toBeNull()
	})

	it('rejects lark sync when a normal user already occupies the thirdPartyId', async () => {
		const { service, bindings } = createHarness({
			users: [
				{ id: 'user-1', tenantId: 'tenant-1', type: UserType.USER },
				{
					id: 'user-2',
					tenantId: 'tenant-1',
					type: UserType.USER,
					thirdPartyId: 'union-1'
				}
			]
		})

		await expect(
			service.bindUser({
				tenantId: 'tenant-1',
				userId: 'user-1',
				provider: 'lark',
				subjectId: 'union-1'
			})
		).rejects.toBeInstanceOf(ConflictException)
		expect(bindings).toHaveLength(0)
	})

	it('does not sync thirdPartyId for non-lark providers', async () => {
		const { service, users } = createHarness({
			users: [{ id: 'user-1', tenantId: 'tenant-1', type: UserType.USER }]
		})

		await service.bindUser({
			tenantId: 'tenant-1',
			userId: 'user-1',
			provider: 'github',
			subjectId: 'subject-1'
		})

		expect(users[0].thirdPartyId).toBeUndefined()
	})

	it('keeps tenant data isolated', async () => {
		const { service, bindings } = createHarness({
			users: [
				{
					id: 'user-1',
					tenantId: 'tenant-1',
					type: UserType.USER,
					role: { id: 'role-1', rolePermissions: [{ id: 'perm-1' }] },
					employee: { id: 'employee-1' }
				},
				{
					id: 'user-2',
					tenantId: 'tenant-2',
					type: UserType.USER,
					role: { id: 'role-2', rolePermissions: [{ id: 'perm-2' }] },
					employee: { id: 'employee-2' }
				}
			],
			bindings: [
				{
					id: 'binding-2',
					tenantId: 'tenant-2',
					userId: 'user-2',
					provider: 'lark',
					subjectId: 'union-1'
				}
			]
		})

		await service.bindUser({
			tenantId: 'tenant-1',
			userId: 'user-1',
			provider: 'lark',
			subjectId: 'union-1'
		})

		const tenantOneUser = await service.resolveUser({
			tenantId: 'tenant-1',
			provider: 'lark',
			subjectId: 'union-1'
		})
		const tenantTwoUser = await service.resolveUser({
			tenantId: 'tenant-2',
			provider: 'lark',
			subjectId: 'union-1'
		})

		expect(bindings).toHaveLength(2)
		expect(tenantOneUser?.id).toBe('user-1')
		expect(tenantOneUser?.role?.id).toBe('role-1')
		expect(tenantOneUser?.employee?.id).toBe('employee-1')
		expect(tenantTwoUser?.id).toBe('user-2')
	})
})
