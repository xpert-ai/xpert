jest.mock('@xpert-ai/plugin-sdk', () => ({
	RequestContext: { currentUser: jest.fn(), currentApiPrincipal: jest.fn() }
}))
jest.mock('../../user/user.entity', () => ({ User: class User {} }))

import { ForbiddenException, NotFoundException, UnauthorizedException } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import { getRepositoryToken } from '@nestjs/typeorm'
import { IUser, UserType } from '@xpert-ai/contracts'
import { RequestContext } from '@xpert-ai/plugin-sdk'
import { createHash } from 'node:crypto'
import { IsNull } from 'typeorm'
import { User } from '../../user/user.entity'
import { PersonalApiKey } from './personal-api-key.entity'
import { PersonalApiKeyService } from './personal-api-key.service'

describe('PersonalApiKeyService', () => {
	const owner: IUser = { id: 'owner', tenantId: 'tenant', type: UserType.USER }
	const token = `sk-user-${'a'.repeat(43)}`
	const keys = { find: jest.fn(), findOne: jest.fn(), create: jest.fn(), save: jest.fn(), update: jest.fn() }
	const users = { findOne: jest.fn() }
	let service: PersonalApiKeyService
	let key: PersonalApiKey

	beforeEach(async () => {
		jest.resetAllMocks()
		jest.mocked(RequestContext.currentUser).mockReturnValue(owner)
		jest.mocked(RequestContext.currentApiPrincipal).mockReturnValue(null)
		key = Object.assign(new PersonalApiKey(), {
			id: 'key',
			userId: owner.id,
			tenantId: owner.tenantId,
			name: 'CLI',
			prefix: token.slice(0, 16),
			tokenHash: createHash('sha256').update(token).digest('hex'),
			createdAt: new Date(),
			expiresAt: null,
			lastUsedAt: null,
			revokedAt: null
		})
		keys.create.mockImplementation((input) => input)
		keys.save.mockImplementation(async (input) => ({ ...key, ...input }))
		keys.findOne.mockResolvedValue(key)
		keys.update.mockResolvedValue({ affected: 1 })
		users.findOne.mockResolvedValue({ ...owner, employee: { id: 'employee' } })
		const module = await Test.createTestingModule({
			providers: [
				PersonalApiKeyService,
				{ provide: getRepositoryToken(PersonalApiKey), useValue: keys },
				{ provide: getRepositoryToken(User), useValue: users }
			]
		}).compile()
		service = module.get(PersonalApiKeyService)
	})

	it('returns a secret once, persists only its hash, and binds the current human without organization scope', async () => {
		const result = await service.create({ name: 'CLI', lifetime: '90' })
		expect(result.token).toMatch(/^sk-user-[A-Za-z0-9_-]{43}$/)
		expect(keys.save).toHaveBeenCalledWith(
			expect.objectContaining({
				userId: owner.id,
				tenantId: owner.tenantId,
				createdById: owner.id,
				tokenHash: createHash('sha256').update(result.token).digest('hex')
			})
		)
		expect(JSON.stringify(keys.save.mock.calls)).not.toContain(result.token)
		expect(keys.save.mock.calls[0][0]).not.toHaveProperty('organizationId')
		expect(result.key).not.toHaveProperty('tokenHash')
		expect(new Date(result.key.expiresAt).getTime() - Date.now()).toBeGreaterThan(89 * 86400000)
	})

	it('supports explicitly non-expiring credentials and produces independent secrets', async () => {
		const first = await service.create({ name: 'A', lifetime: 'never' })
		const second = await service.create({ name: 'B', lifetime: 'never' })
		expect(first.key.expiresAt).toBeNull()
		expect(first.token).not.toBe(second.token)
	})

	it('lists only owner metadata even if the repository returns a hash', async () => {
		keys.find.mockResolvedValue([key])
		const result = await service.list()
		expect(keys.find).toHaveBeenCalledWith({
			where: { userId: owner.id, tenantId: owner.tenantId },
			order: { createdAt: 'DESC' }
		})
		expect(JSON.stringify(result)).not.toContain(key.tokenHash)
		expect(result[0]).not.toHaveProperty('userId')
	})

	it('scopes revocation to the owner and tenant, including foreign IDs', async () => {
		keys.update.mockResolvedValue({ affected: 0 })
		await expect(service.revoke('foreign-key')).rejects.toBeInstanceOf(NotFoundException)
		expect(keys.update).toHaveBeenCalledWith(
			{ id: 'foreign-key', userId: owner.id, tenantId: owner.tenantId, revokedAt: IsNull() },
			{ revokedAt: expect.any(Date) }
		)
	})

	it('denies management to technical and delegated resource principals', async () => {
		jest.mocked(RequestContext.currentUser).mockReturnValue({ ...owner, type: UserType.COMMUNICATION })
		await expect(service.create({ name: 'CLI', lifetime: 'never' })).rejects.toBeInstanceOf(ForbiddenException)
		jest.mocked(RequestContext.currentUser).mockReturnValue(owner)
		jest.mocked(RequestContext.currentApiPrincipal).mockReturnValue({ ...owner, principalType: 'client_secret' })
		await expect(service.list()).rejects.toBeInstanceOf(ForbiddenException)
		await expect(service.revoke('key')).rejects.toBeInstanceOf(ForbiddenException)
	})

	it('loads the current human and permissions without constructing a technical principal', async () => {
		const first = await service.authenticate(token)
		expect(first).toMatchObject({ ...owner, employeeId: 'employee' })
		expect(first).not.toHaveProperty('apiKey')
		expect(first).not.toHaveProperty('principalType')
		expect(users.findOne).toHaveBeenCalledWith({
			where: { id: owner.id, tenantId: owner.tenantId, type: UserType.USER },
			relations: ['role', 'role.rolePermissions', 'employee']
		})
		users.findOne.mockResolvedValue({ ...owner, roleId: 'new-role' })
		expect(await service.authenticate(token)).toMatchObject({ roleId: 'new-role' })
		expect(keys.findOne).toHaveBeenCalledWith({ where: { tokenHash: key.tokenHash, revokedAt: IsNull() } })
	})

	it.each(['sk-x-resource-key', 'sk-user-invalid', ''])(
		'rejects malformed or other credential families (%s)',
		async (invalid) => {
			await expect(service.authenticate(invalid)).rejects.toBeInstanceOf(UnauthorizedException)
			expect(keys.findOne).not.toHaveBeenCalled()
		}
	)

	it('rejects unknown and revoked keys before loading a user', async () => {
		keys.findOne.mockResolvedValue(null)
		await expect(service.authenticate(token)).rejects.toBeInstanceOf(UnauthorizedException)
		expect(users.findOne).not.toHaveBeenCalled()
	})

	it('rejects expiry at the exact boundary and revocation during authentication', async () => {
		key.expiresAt = new Date()
		await expect(service.authenticate(token)).rejects.toBeInstanceOf(UnauthorizedException)
		expect(users.findOne).not.toHaveBeenCalled()
		key.expiresAt = null
		keys.update.mockResolvedValue({ affected: 0 })
		await expect(service.authenticate(token)).rejects.toBeInstanceOf(UnauthorizedException)
	})

	it.each([null, { ...owner, deletedAt: new Date() }, { ...owner, type: UserType.COMMUNICATION }])(
		'rejects deleted or non-human owners',
		async (user) => {
			users.findOne.mockResolvedValue(user)
			await expect(service.authenticate(token)).rejects.toBeInstanceOf(UnauthorizedException)
			expect(keys.update).not.toHaveBeenCalled()
		}
	)
})
