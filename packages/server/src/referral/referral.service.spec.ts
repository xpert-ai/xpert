jest.mock('../core/context', () => ({
	RequestContext: {
		currentTenantId: jest.fn(),
		currentUserId: jest.fn(),
		currentUser: jest.fn(),
		isTenantScope: jest.fn()
	}
}))

import { BadRequestException, NotFoundException } from '@nestjs/common'
import { UserType } from '@xpert-ai/contracts'
import { RequestContext } from '../core/context'
import { FeatureOrganization } from '../feature/feature-organization.entity'
import { ReferralCode } from './referral-code.entity'
import { ReferralRelation } from './referral-relation.entity'
import { ReferralService } from './referral.service'

describe('ReferralService registration binding', () => {
	const featureRepository = {
		findOne: jest.fn()
	}
	const codeQueryBuilder = {
		innerJoinAndSelect: jest.fn().mockReturnThis(),
		where: jest.fn().mockReturnThis(),
		andWhere: jest.fn().mockReturnThis(),
		getOne: jest.fn()
	}
	const codeInsertQueryBuilder = {
		insert: jest.fn().mockReturnThis(),
		into: jest.fn().mockReturnThis(),
		values: jest.fn().mockReturnThis(),
		orIgnore: jest.fn().mockReturnThis(),
		execute: jest.fn()
	}
	const codeRepository = {
		createQueryBuilder: jest.fn((alias?: string) => (alias ? codeQueryBuilder : codeInsertQueryBuilder)),
		findOne: jest.fn()
	}
	const relationQueryBuilder = {
		withDeleted: jest.fn().mockReturnThis(),
		leftJoinAndSelect: jest.fn().mockReturnThis(),
		where: jest.fn().mockReturnThis(),
		andWhere: jest.fn().mockReturnThis(),
		orderBy: jest.fn().mockReturnThis(),
		skip: jest.fn().mockReturnThis(),
		take: jest.fn().mockReturnThis(),
		getManyAndCount: jest.fn()
	}
	const relationRepository = {
		findOne: jest.fn(),
		save: jest.fn(),
		createQueryBuilder: jest.fn(() => relationQueryBuilder)
	}
	const manager = {
		getRepository: jest.fn((entity) => {
			switch (entity) {
				case FeatureOrganization:
					return featureRepository
				case ReferralCode:
					return codeRepository
				case ReferralRelation:
					return relationRepository
				default:
					throw new Error('Unexpected repository')
			}
		})
	}
	let service: ReferralService

	beforeEach(() => {
		jest.clearAllMocks()
		service = new ReferralService(codeRepository as never, relationRepository as never, featureRepository as never)
		featureRepository.findOne.mockResolvedValue({ id: 'feature-toggle-1' })
		relationRepository.findOne.mockResolvedValue(null)
		relationRepository.save.mockImplementation(async (entity) => entity)
		relationQueryBuilder.getManyAndCount.mockResolvedValue([[], 0])
		codeInsertQueryBuilder.execute.mockResolvedValue({})
		codeRepository.findOne.mockResolvedValue({
			code: 'ABC234DEFG'
		})
		codeQueryBuilder.getOne.mockResolvedValue({
			code: 'ABC234DEFG',
			userId: 'referrer-1'
		})
		jest.mocked(RequestContext.currentTenantId).mockReturnValue('tenant-1')
		jest.mocked(RequestContext.currentUserId).mockReturnValue('user-1')
		jest.mocked(RequestContext.currentUser).mockReturnValue({
			id: 'user-1',
			type: UserType.USER
		} as never)
		jest.mocked(RequestContext.isTenantScope).mockReturnValue(true)
	})

	it('ignores referral input completely while the feature is disabled', async () => {
		featureRepository.findOne.mockResolvedValue(null)

		await service.bindRegistration(manager as never, {
			tenantId: 'tenant-1',
			referredUserId: 'referred-1',
			referralCode: 'INVALID'
		})

		expect(relationRepository.findOne).not.toHaveBeenCalled()
		expect(codeRepository.createQueryBuilder).not.toHaveBeenCalled()
		expect(relationRepository.save).not.toHaveBeenCalled()
	})

	it('rejects an invalid code while the feature is enabled', async () => {
		codeQueryBuilder.getOne.mockResolvedValue(null)

		await expect(
			service.bindRegistration(manager as never, {
				tenantId: 'tenant-1',
				referredUserId: 'referred-1',
				referralCode: 'INVALID'
			})
		).rejects.toBeInstanceOf(BadRequestException)

		expect(relationRepository.save).not.toHaveBeenCalled()
	})

	it('persists one direct relationship for a valid tenant code', async () => {
		await service.bindRegistration(manager as never, {
			tenantId: 'tenant-1',
			referredUserId: 'referred-1',
			referralCode: 'abc234defg'
		})

		expect(codeQueryBuilder.andWhere).toHaveBeenCalledWith('referralCode.code = :code', {
			code: 'ABC234DEFG'
		})
		expect(codeQueryBuilder.where).toHaveBeenCalledWith('referralCode.tenantId = :tenantId', {
			tenantId: 'tenant-1'
		})
		expect(relationRepository.save).toHaveBeenCalledWith({
			tenantId: 'tenant-1',
			referrerUserId: 'referrer-1',
			referredUserId: 'referred-1',
			usedCode: 'ABC234DEFG'
		})
	})

	it('does not replace an existing relationship', async () => {
		relationRepository.findOne.mockResolvedValue({
			id: 'relation-1'
		})

		await service.bindRegistration(manager as never, {
			tenantId: 'tenant-1',
			referredUserId: 'referred-1',
			referralCode: 'ABC234DEFG'
		})

		expect(codeRepository.createQueryBuilder).not.toHaveBeenCalled()
		expect(relationRepository.save).not.toHaveBeenCalled()
	})

	it('returns the existing invitation code without creating another one', async () => {
		await expect(service.getMyCode()).resolves.toEqual({
			code: 'ABC234DEFG'
		})

		expect(codeInsertQueryBuilder.execute).not.toHaveBeenCalled()
	})

	it('creates an invitation code on demand when an existing account has none', async () => {
		codeRepository.findOne.mockResolvedValueOnce(null).mockResolvedValueOnce({
			code: 'ABC234DEFG'
		})

		await expect(service.getMyCode()).resolves.toEqual({
			code: 'ABC234DEFG'
		})

		expect(codeInsertQueryBuilder.values).toHaveBeenCalledWith({
			tenantId: 'tenant-1',
			userId: 'user-1',
			code: expect.stringMatching(/^[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{10}$/)
		})
		expect(codeInsertQueryBuilder.orIgnore).toHaveBeenCalled()
		expect(codeInsertQueryBuilder.execute).toHaveBeenCalledTimes(1)
	})

	it('retries on-demand generation when a candidate code collides', async () => {
		codeRepository.findOne.mockResolvedValueOnce(null).mockResolvedValueOnce(null).mockResolvedValueOnce({
			code: 'ABC234DEFG'
		})

		await expect(service.getMyCode()).resolves.toEqual({
			code: 'ABC234DEFG'
		})

		expect(codeInsertQueryBuilder.execute).toHaveBeenCalledTimes(2)
	})

	it('does not create invitation codes for communication users on demand', async () => {
		jest.mocked(RequestContext.currentUser).mockReturnValue({
			id: 'user-1',
			type: UserType.COMMUNICATION
		} as never)

		await expect(service.getMyCode()).rejects.toBeInstanceOf(NotFoundException)

		expect(codeRepository.findOne).not.toHaveBeenCalled()
		expect(codeInsertQueryBuilder.execute).not.toHaveBeenCalled()
	})

	it('returns tenant-scoped deleted account placeholders', async () => {
		const boundAt = new Date('2026-07-28T00:00:00.000Z')
		relationQueryBuilder.getManyAndCount.mockResolvedValue([
			[
				{
					id: 'relation-1',
					referrerUserId: null,
					referrerUser: null,
					referredUserId: 'referred-1',
					referredUser: {
						id: 'referred-1',
						firstName: 'Deleted',
						lastName: 'User',
						email: 'deleted@example.com',
						deletedAt: boundAt
					},
					usedCode: 'ABC234DEFG',
					boundAt
				}
			],
			1
		])

		await expect(service.getRelations({ take: 20, skip: 0 })).resolves.toEqual({
			items: [
				{
					id: 'relation-1',
					referrer: {
						id: null,
						name: null,
						email: null,
						deleted: true
					},
					referred: {
						id: 'referred-1',
						name: 'Deleted User',
						email: 'deleted@example.com',
						deleted: true
					},
					usedCode: 'ABC234DEFG',
					boundAt
				}
			],
			total: 1
		})
		expect(relationQueryBuilder.where).toHaveBeenCalledWith('relation.tenantId = :tenantId', {
			tenantId: 'tenant-1'
		})
	})

	it('rejects relationship listing outside tenant scope', async () => {
		jest.mocked(RequestContext.isTenantScope).mockReturnValue(false)

		await expect(service.getRelations({})).rejects.toBeInstanceOf(BadRequestException)

		expect(relationRepository.createQueryBuilder).not.toHaveBeenCalled()
	})
})
