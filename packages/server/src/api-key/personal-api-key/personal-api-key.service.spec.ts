jest.mock('../../user/user.service', () => ({ UserService: class UserService {} }))
jest.mock('../../integration', () => ({ IntegrationService: class IntegrationService {} }))

import { BadRequestException, ForbiddenException, NotFoundException, UnauthorizedException } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import { getRepositoryToken } from '@nestjs/typeorm'
import { ApiKeyBindingType, IUser, UserType } from '@xpert-ai/contracts'
import { RequestContext } from '@xpert-ai/plugin-sdk'
import { IsNull } from 'typeorm'
import { ApiKey } from '../api-key.entity'
import { ApiKeyService } from '../api-key.service'
import { UserService } from '../../user/user.service'
import { IntegrationService } from '../../integration'
import { hashPersonalApiKey } from './personal-api-key-token'

describe('Personal credentials in ApiKeyService', () => {
	const owner: IUser = { id: 'owner', tenantId: 'tenant', type: UserType.USER }
	const token = `sk-user-${'a'.repeat(43)}`
	const repository = {
		find: jest.fn(),
		findOne: jest.fn(),
		create: jest.fn(),
		save: jest.fn(),
		update: jest.fn(),
		findAndCount: jest.fn(),
		count: jest.fn(),
		delete: jest.fn()
	}
	let service: ApiKeyService
	let key: ApiKey

	beforeEach(async () => {
		jest.restoreAllMocks()
		jest.resetAllMocks()
		jest.spyOn(RequestContext, 'currentUser').mockReturnValue(owner)
		jest.spyOn(RequestContext, 'currentUserId').mockReturnValue(owner.id)
		jest.spyOn(RequestContext, 'currentTenantId').mockReturnValue(owner.tenantId)
		jest.spyOn(RequestContext, 'getOrganizationId').mockReturnValue('selected-org')
		jest.spyOn(RequestContext, 'currentApiPrincipal').mockReturnValue(null)
		key = Object.assign(new ApiKey(), {
			id: 'key',
			type: ApiKeyBindingType.USER,
			entityId: owner.id,
			userId: owner.id,
			tenantId: owner.tenantId,
			organizationId: null,
			name: 'CLI',
			prefix: token.slice(0, 16),
			token: hashPersonalApiKey(token),
			createdAt: new Date(),
			validUntil: null,
			lastUsedAt: null,
			revokedAt: null,
			user: { ...owner, employee: { id: 'employee' } }
		})
		repository.create.mockImplementation((input) => input)
		repository.save.mockImplementation(async (input) => ({ ...key, ...input }))
		repository.update.mockResolvedValue({ affected: 1 })
		repository.findAndCount.mockResolvedValue([[], 0])
		repository.count.mockResolvedValue(0)
		const module = await Test.createTestingModule({
			providers: [
				ApiKeyService,
				{ provide: getRepositoryToken(ApiKey), useValue: repository },
				{ provide: UserService, useValue: {} },
				{ provide: IntegrationService, useValue: {} }
			]
		}).compile()
		service = module.get(ApiKeyService)
	})
	afterEach(() => jest.restoreAllMocks())

	it('creates a user binding in api_key, hashing the token and ignoring the selected organization', async () => {
		const result = await service.createPersonal({ name: 'CLI', lifetime: '90' })
		expect(result.token).toMatch(/^sk-user-[A-Za-z0-9_-]{43}$/)
		expect(repository.save).toHaveBeenCalledWith(
			expect.objectContaining({
				type: ApiKeyBindingType.USER,
				entityId: owner.id,
				userId: owner.id,
				tenantId: owner.tenantId,
				createdById: owner.id,
				organizationId: null,
				token: hashPersonalApiKey(result.token)
			})
		)
		expect(JSON.stringify(repository.save.mock.calls)).not.toContain(result.token)
		expect(result.key).not.toHaveProperty('token')
		expect(new Date(result.key.expiresAt).getTime() - Date.now()).toBeGreaterThan(89 * 86400000)
	})

	it('supports independently generated non-expiring credentials', async () => {
		const first = await service.createPersonal({ name: 'A', lifetime: 'never' })
		const second = await service.createPersonal({ name: 'B', lifetime: 'never' })
		expect(first.key.expiresAt).toBeNull()
		expect(first.token).not.toBe(second.token)
	})

	it('lists only current-owner metadata across organization selections', async () => {
		repository.find.mockResolvedValue([key])
		const first = await service.listPersonal()
		jest.mocked(RequestContext.getOrganizationId).mockReturnValue('another-org')
		expect(await service.listPersonal()).toEqual(first)
		expect(repository.find).toHaveBeenLastCalledWith(
			expect.objectContaining({
				where: {
					type: ApiKeyBindingType.USER,
					userId: owner.id,
					tenantId: owner.tenantId,
					organizationId: IsNull()
				}
			})
		)
		expect(JSON.stringify(first)).not.toContain(key.token)
		expect(first[0]).not.toHaveProperty('userId')
	})

	it('only revokes the current owner and tenant personal binding', async () => {
		repository.update.mockResolvedValue({ affected: 0 })
		await expect(service.revokePersonal('foreign')).rejects.toBeInstanceOf(NotFoundException)
		expect(repository.update).toHaveBeenCalledWith(
			{
				id: 'foreign',
				type: ApiKeyBindingType.USER,
				userId: owner.id,
				tenantId: owner.tenantId,
				organizationId: IsNull(),
				revokedAt: IsNull()
			},
			{ revokedAt: expect.any(Date) }
		)
	})

	it('denies personal-key management to technical or delegated principals', async () => {
		jest.mocked(RequestContext.currentUser).mockReturnValue({ ...owner, type: UserType.COMMUNICATION })
		await expect(service.createPersonal({ name: 'CLI', lifetime: 'never' })).rejects.toBeInstanceOf(
			ForbiddenException
		)
		jest.mocked(RequestContext.currentUser).mockReturnValue(owner)
		jest.mocked(RequestContext.currentApiPrincipal).mockReturnValue({ ...owner, principalType: 'client_secret' })
		await expect(service.listPersonal()).rejects.toBeInstanceOf(ForbiddenException)
		await expect(service.revokePersonal('key')).rejects.toBeInstanceOf(ForbiddenException)
	})

	it('restores the human identity and disallows impersonation or resource-principal conversion', async () => {
		expect(service.resolvePersonalUser(key)).toMatchObject({ ...owner, employeeId: 'employee' })
		expect(service.resolvePersonalUser(key)).not.toHaveProperty('principalType')
		expect(() => service.resolvePersonalUser(key, 'another-user')).toThrow(UnauthorizedException)
		await expect(service.resolvePrincipal(key)).rejects.toBeInstanceOf(UnauthorizedException)
	})

	it.each([
		{ user: null },
		{ user: { ...owner, deletedAt: new Date() } },
		{ user: { ...owner, type: UserType.COMMUNICATION } },
		{ userId: 'other' },
		{ entityId: 'other' },
		{ tenantId: 'other' },
		{ organizationId: 'org' }
	])('rejects an invalid personal owner binding: %j', (change) => {
		expect(() => service.resolvePersonalUser({ ...key, ...change })).toThrow(UnauthorizedException)
	})

	it('checks expiry/revocation including races when recording usage', async () => {
		key.validUntil = new Date()
		await expect(service.recordUse(key)).rejects.toBeInstanceOf(UnauthorizedException)
		expect(repository.update).not.toHaveBeenCalled()
		key.validUntil = null
		key.revokedAt = new Date()
		await expect(service.recordUse(key)).rejects.toBeInstanceOf(UnauthorizedException)
		key.revokedAt = null
		repository.update.mockResolvedValue({ affected: 0 })
		await expect(service.recordUse(key)).rejects.toBeInstanceOf(UnauthorizedException)
		expect(repository.update).toHaveBeenCalledWith(
			expect.arrayContaining([
				expect.objectContaining({
					id: key.id,
					token: key.token,
					type: ApiKeyBindingType.USER,
					revokedAt: IsNull()
				})
			]),
			{ lastUsedAt: expect.any(Date) }
		)
	})

	it('blocks personal mutations and type promotion through legacy CRUD', async () => {
		await expect(service.create({ type: ApiKeyBindingType.USER })).rejects.toBeInstanceOf(BadRequestException)
		await expect(service.create({ token })).rejects.toBeInstanceOf(BadRequestException)
		await expect(service.create({ id: key.id })).rejects.toBeInstanceOf(BadRequestException)
		await expect(service.update('resource', { type: ApiKeyBindingType.USER })).rejects.toBeInstanceOf(
			BadRequestException
		)
		await expect(service.update('resource', { token })).rejects.toBeInstanceOf(BadRequestException)
		repository.findOne.mockResolvedValue(null)
		await expect(service.update(key.id, { name: 'renamed' })).rejects.toBeInstanceOf(NotFoundException)
		await expect(service.delete(key.id)).rejects.toBeInstanceOf(NotFoundException)
		expect(repository.update).not.toHaveBeenCalled()
		expect(repository.delete).not.toHaveBeenCalled()
	})
})
