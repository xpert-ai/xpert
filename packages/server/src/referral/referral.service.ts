import {
	FeatureEnum,
	IPagination,
	IReferralCodeView,
	IReferralRelationQuery,
	IReferralRelationView
} from '@xpert-ai/contracts'
import { BadRequestException, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { t } from 'i18next'
import { EntityManager, IsNull, Repository } from 'typeorm'
import { RequestContext } from '../core/context'
import { FeatureOrganization } from '../feature/feature-organization.entity'
import { ReferralCode } from './referral-code.entity'
import { ReferralRelation } from './referral-relation.entity'

@Injectable()
export class ReferralService {
	constructor(
		@InjectRepository(ReferralCode)
		private readonly referralCodeRepository: Repository<ReferralCode>,
		@InjectRepository(ReferralRelation)
		private readonly referralRelationRepository: Repository<ReferralRelation>,
		@InjectRepository(FeatureOrganization)
		private readonly featureOrganizationRepository: Repository<FeatureOrganization>
	) {}

	async isFeatureEnabled(tenantId: string, manager?: EntityManager) {
		const repository = manager ? manager.getRepository(FeatureOrganization) : this.featureOrganizationRepository
		const toggle = await repository.findOne({
			where: {
				tenantId,
				organizationId: IsNull(),
				isEnabled: true,
				feature: {
					code: FeatureEnum.FEATURE_REFERRAL
				}
			},
			relations: {
				feature: true
			}
		})
		return !!toggle
	}

	async validatePublicCode(tenantId: string, code?: string) {
		return this.validateCode(tenantId, code)
	}

	async validateCode(tenantId: string, code?: string, manager?: EntityManager) {
		const normalizedCode = this.normalizeCode(code)
		if (!normalizedCode || !(await this.isFeatureEnabled(tenantId, manager))) {
			return false
		}

		const repository = manager ? manager.getRepository(ReferralCode) : this.referralCodeRepository
		return repository
			.createQueryBuilder('referralCode')
			.innerJoin('referralCode.user', 'user')
			.where('referralCode.tenantId = :tenantId', { tenantId })
			.andWhere('referralCode.code = :code', { code: normalizedCode })
			.andWhere('user.deletedAt IS NULL')
			.getExists()
	}

	async bindRegistration(
		manager: EntityManager,
		input: {
			tenantId: string
			referredUserId: string
			referralCode?: string
		}
	) {
		const normalizedCode = this.normalizeCode(input.referralCode)
		if (!normalizedCode || !(await this.isFeatureEnabled(input.tenantId, manager))) {
			return
		}

		const codeRepository = manager.getRepository(ReferralCode)
		const relationRepository = manager.getRepository(ReferralRelation)
		const existingRelation = await relationRepository.findOne({
			where: {
				tenantId: input.tenantId,
				referredUserId: input.referredUserId
			}
		})
		if (existingRelation) {
			return
		}

		const referralCode = await codeRepository
			.createQueryBuilder('referralCode')
			.innerJoinAndSelect('referralCode.user', 'user')
			.where('referralCode.tenantId = :tenantId', { tenantId: input.tenantId })
			.andWhere('referralCode.code = :code', { code: normalizedCode })
			.andWhere('user.deletedAt IS NULL')
			.getOne()

		if (!referralCode?.userId || referralCode.userId === input.referredUserId) {
			throw new BadRequestException(
				t('server-ai:Error.ReferralInvalidCode', {
					defaultValue: 'The invitation code is invalid.'
				})
			)
		}

		await relationRepository.save({
			tenantId: input.tenantId,
			referrerUserId: referralCode.userId,
			referredUserId: input.referredUserId,
			usedCode: referralCode.code
		})
	}

	async getMyCode(): Promise<IReferralCodeView> {
		const tenantId = this.requireTenantId()
		await this.assertFeatureEnabled(tenantId)
		const userId = RequestContext.currentUserId()
		if (!userId) {
			throw new UnauthorizedException(
				t('server-ai:Error.ReferralAuthenticatedUserRequired', {
					defaultValue: 'Authenticated user is required.'
				})
			)
		}
		const referralCode = await this.referralCodeRepository.findOne({
			where: {
				tenantId,
				userId
			}
		})

		if (!referralCode) {
			throw new NotFoundException(
				t('server-ai:Error.ReferralCodeNotFound', {
					defaultValue: 'The invitation code was not found.'
				})
			)
		}

		return { code: referralCode.code }
	}

	async getRelations(query: IReferralRelationQuery): Promise<IPagination<IReferralRelationView>> {
		const tenantId = this.requireTenantId()
		if (!RequestContext.isTenantScope()) {
			throw new BadRequestException(
				t('server-ai:Error.ReferralTenantScopeRequired', {
					defaultValue: 'Tenant scope is required.'
				})
			)
		}
		await this.assertFeatureEnabled(tenantId)

		const take = Math.min(Math.max(query.take ?? 20, 1), 100)
		const skip = Math.max(query.skip ?? 0, 0)
		const search = query.search?.trim().toLowerCase()
		const queryBuilder = this.referralRelationRepository
			.createQueryBuilder('relation')
			.withDeleted()
			.leftJoinAndSelect('relation.referrerUser', 'referrerUser')
			.leftJoinAndSelect('relation.referredUser', 'referredUser')
			.where('relation.tenantId = :tenantId', { tenantId })
			.orderBy('relation.boundAt', 'DESC')
			.skip(skip)
			.take(take)

		if (search) {
			queryBuilder.andWhere(
				`(
					LOWER(relation.usedCode) LIKE :search OR
					LOWER(COALESCE(referrerUser.email, '')) LIKE :search OR
					LOWER(COALESCE(referrerUser.username, '')) LIKE :search OR
					LOWER(COALESCE(referrerUser.firstName, '') || ' ' || COALESCE(referrerUser.lastName, '')) LIKE :search OR
					LOWER(COALESCE(referredUser.email, '')) LIKE :search OR
					LOWER(COALESCE(referredUser.username, '')) LIKE :search OR
					LOWER(COALESCE(referredUser.firstName, '') || ' ' || COALESCE(referredUser.lastName, '')) LIKE :search
				)`,
				{ search: `%${search}%` }
			)
		}

		const [relations, total] = await queryBuilder.getManyAndCount()
		return {
			items: relations.map((relation) => ({
				id: String(relation.id),
				referrer: this.toAccountView(relation.referrerUser, relation.referrerUserId),
				referred: this.toAccountView(relation.referredUser, relation.referredUserId),
				usedCode: relation.usedCode,
				boundAt: relation.boundAt
			})),
			total
		}
	}

	private toAccountView(user: ReferralRelation['referrerUser'], userId?: string | null) {
		if (!user) {
			return {
				id: userId ?? null,
				name: null,
				email: null,
				deleted: true
			}
		}

		return {
			id: user.id ? String(user.id) : (userId ?? null),
			name: [user.firstName, user.lastName].filter(Boolean).join(' ') || user.username || user.email || null,
			email: user.email ?? null,
			deleted: !!user.deletedAt
		}
	}

	private async assertFeatureEnabled(tenantId: string) {
		if (!(await this.isFeatureEnabled(tenantId))) {
			throw new NotFoundException()
		}
	}

	private requireTenantId() {
		const tenantId = RequestContext.currentTenantId()
		if (!tenantId) {
			throw new BadRequestException(
				t('server-ai:Error.ReferralTenantContextRequired', {
					defaultValue: 'Tenant context is required.'
				})
			)
		}
		return tenantId
	}

	private normalizeCode(code?: string) {
		const normalized = code?.trim().toUpperCase()
		return normalized || null
	}
}
