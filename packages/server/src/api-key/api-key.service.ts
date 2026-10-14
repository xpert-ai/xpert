import {
	ApiKeyBindingType,
	ApiPrincipalType,
	IApiKey,
	IApiPrincipal,
	IUser,
	PersonalApiKeyCreated,
	PersonalApiKeySummary,
	UserType
} from '@xpert-ai/contracts'
import {
	BadRequestException,
	ForbiddenException,
	Injectable,
	NotFoundException,
	UnauthorizedException
} from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { nanoid } from 'nanoid'
import {
	And,
	Equal,
	FindManyOptions,
	FindOperator,
	FindOptionsWhere,
	IsNull,
	MoreThan,
	Not,
	Or,
	Repository
} from 'typeorm'
import { QueryDeepPartialEntity } from 'typeorm/query-builder/QueryPartialEntity'
import { RequestContext } from '@xpert-ai/plugin-sdk'
import { randomBytes } from 'node:crypto'
import { t } from 'i18next'
import { PaginationParams, TenantOrganizationAwareCrudService } from '../core/crud'
import { IntegrationService } from '../integration'
import { UserService } from '../user/user.service'
import type { User } from '../user/user.entity'
import { buildApiKeyPrincipal } from './api-key-principal'
import { ApiKey } from './api-key.entity'
import { PersonalApiKeyCreate } from './personal-api-key/personal-api-key.schema'
import { hashPersonalApiKey, PERSONAL_API_KEY_PREFIX } from './personal-api-key/personal-api-key-token'

const REQUEST_CONTEXT_USER_RELATIONS = ['role', 'role.rolePermissions', 'employee'] as const

@Injectable()
export class ApiKeyService extends TenantOrganizationAwareCrudService<ApiKey> {
	constructor(
		@InjectRepository(ApiKey) repository: Repository<ApiKey>,
		private readonly userService: UserService,
		private readonly integrationService: IntegrationService
	) {
		super(repository)
	}

	async create(entity: Partial<IApiKey>) {
		this.assertResourceInput(entity)
		if (entity.id) throw new BadRequestException()
		return super.create({
			name: entity.name,
			type: entity.type,
			entityId: entity.entityId,
			userId: entity.userId,
			validUntil: entity.validUntil,
			token: entity.token || `sk-x-${nanoid(100)}`
		})
	}

	override async update(id: string | number | FindOptionsWhere<ApiKey>, entity: QueryDeepPartialEntity<ApiKey>) {
		this.assertResourceInput(entity)
		return super.update(this.resourceWhere(typeof id === 'object' ? id : { id: String(id) }), {
			name: entity.name,
			type: entity.type,
			entityId: entity.entityId,
			userId: entity.userId,
			validUntil: entity.validUntil,
			token: entity.token
		})
	}

	private assertResourceInput(entity: QueryDeepPartialEntity<ApiKey>) {
		if (
			entity.type === ApiKeyBindingType.USER ||
			entity.prefix !== undefined ||
			entity.revokedAt !== undefined ||
			(typeof entity.token === 'string' && entity.token.startsWith(PERSONAL_API_KEY_PREFIX))
		)
			throw new BadRequestException()
	}

	/** Legacy CRUD only manages resource keys. Personal credentials use owner-scoped operations below. */
	private resourceWhere(where: FindOptionsWhere<ApiKey> = {}): FindOptionsWhere<ApiKey> {
		const resourceType = Or(IsNull(), Not(ApiKeyBindingType.USER))
		return {
			...where,
			tenantId: RequestContext.currentTenantId(),
			organizationId: RequestContext.getOrganizationId() ?? IsNull(),
			type: where.type
				? And(where.type instanceof FindOperator ? where.type : Equal(where.type), resourceType)
				: resourceType
		}
	}

	protected override findConditionsWithTenantByUser(user: User): FindOptionsWhere<ApiKey> {
		return this.resourceWhere(super.findConditionsWithTenantByUser(user))
	}

	protected override findConditionsWithTenant(
		user: User,
		where?: FindOptionsWhere<ApiKey> | FindOptionsWhere<ApiKey>[]
	) {
		return Array.isArray(where) ? where.map((item) => this.resourceWhere(item)) : this.resourceWhere(where)
	}

	override countBy(where?: FindOptionsWhere<ApiKey>) {
		return this.count({ where: this.resourceWhere(where) })
	}

	override paginate(filter?: PaginationParams<ApiKey>) {
		return this.findAll({
			...filter,
			take: filter?.take ?? 10,
			skip: filter?.skip ? (filter.skip - 1) * (filter.take ?? 10) : 0
		})
	}

	override findMyAll(filter?: FindManyOptions<ApiKey>) {
		const ownerWhere = (where: FindOptionsWhere<ApiKey>) => ({
			...where,
			createdById: RequestContext.currentUserId()
		})
		return this.findAll({
			...filter,
			where: Array.isArray(filter?.where) ? filter.where.map(ownerWhere) : ownerWhere(filter?.where ?? {})
		})
	}

	protected override async checkUpdateAuthorization(id: string | number | FindOptionsWhere<ApiKey>) {
		const record = await this.repository.findOne({
			where: this.resourceWhere(typeof id === 'object' ? id : { id: String(id) }),
			select: { id: true }
		})
		if (!record) throw new NotFoundException()
	}

	async listPersonal(): Promise<PersonalApiKeySummary[]> {
		const owner = this.personalOwner()
		const keys = await this.repository.find({
			where: {
				type: ApiKeyBindingType.USER,
				userId: owner.id,
				tenantId: owner.tenantId,
				organizationId: IsNull()
			},
			select: {
				id: true,
				name: true,
				prefix: true,
				createdAt: true,
				validUntil: true,
				lastUsedAt: true,
				revokedAt: true
			},
			order: { createdAt: 'DESC' }
		})
		return keys.map((key) => this.personalSummary(key))
	}

	async createPersonal(input: PersonalApiKeyCreate): Promise<PersonalApiKeyCreated> {
		const owner = this.personalOwner()
		const token = PERSONAL_API_KEY_PREFIX + randomBytes(32).toString('base64url')
		const key = await this.repository.save(
			this.repository.create({
				type: ApiKeyBindingType.USER,
				entityId: owner.id,
				userId: owner.id,
				tenantId: owner.tenantId,
				organizationId: null,
				createdById: owner.id,
				name: input.name,
				token: hashPersonalApiKey(token),
				prefix: token.slice(0, 16),
				validUntil:
					input.lifetime === 'never' ? null : new Date(Date.now() + Number(input.lifetime) * 86400000),
				lastUsedAt: null,
				revokedAt: null
			})
		)
		return { key: this.personalSummary(key), token }
	}

	async revokePersonal(id: string): Promise<void> {
		const owner = this.personalOwner()
		const result = await this.repository.update(
			{
				id,
				type: ApiKeyBindingType.USER,
				userId: owner.id,
				tenantId: owner.tenantId,
				organizationId: IsNull(),
				revokedAt: IsNull()
			},
			{ revokedAt: new Date() }
		)
		if (!result.affected) throw new NotFoundException(t('server-ai:Error.PersonalApiKeyNotFound'))
	}

	resolvePersonalUser(apiKey: IApiKey, requestedUserId?: string | null): IUser {
		const user = apiKey.user
		if (
			apiKey.type !== ApiKeyBindingType.USER ||
			apiKey.organizationId ||
			!user?.id ||
			user.type !== UserType.USER ||
			user.deletedAt ||
			user.id !== apiKey.userId ||
			user.id !== apiKey.entityId ||
			user.tenantId !== apiKey.tenantId ||
			(requestedUserId != null && requestedUserId !== user.id)
		)
			throw new UnauthorizedException()
		user.employeeId = user.employee?.id
		return user
	}

	/** Authentication rechecks revocation and expiry atomically when recording use. */
	async recordUse(apiKey: IApiKey): Promise<void> {
		const now = new Date()
		if (apiKey.revokedAt || (apiKey.validUntil && apiKey.validUntil <= now)) throw new UnauthorizedException()
		const active = { id: apiKey.id, token: apiKey.token, type: apiKey.type ?? IsNull(), revokedAt: IsNull() }
		const result = await this.repository.update(
			[
				{ ...active, validUntil: IsNull() },
				{ ...active, validUntil: MoreThan(now) }
			],
			{ lastUsedAt: now }
		)
		if (!result.affected) throw new UnauthorizedException()
	}

	private personalOwner(): IUser & { id: string; tenantId: string } {
		const user = RequestContext.currentUser()
		if (
			!user?.id ||
			!user.tenantId ||
			user.type !== UserType.USER ||
			user.deletedAt ||
			RequestContext.currentApiPrincipal()
		) {
			throw new ForbiddenException(t('server-ai:Error.PersonalApiKeyHumanRequired'))
		}
		return { ...user, id: user.id, tenantId: user.tenantId }
	}

	private personalSummary(key: ApiKey): PersonalApiKeySummary {
		return {
			id: key.id,
			name: key.name,
			prefix: key.prefix,
			createdAt: key.createdAt.toISOString(),
			expiresAt: key.validUntil?.toISOString() ?? null,
			lastUsedAt: key.lastUsedAt?.toISOString() ?? null,
			revokedAt: key.revokedAt?.toISOString() ?? null
		}
	}

	async resolvePrincipal(
		apiKey: IApiKey & { createdBy?: IUser | null; user?: IUser | null },
		options?: {
			requestedUserId?: string | null
			requestedOrganizationId?: string | null
			principalType?: ApiPrincipalType
		}
	): Promise<IApiPrincipal> {
		// Personal keys must never acquire resource delegation or caller-selected identities.
		if (apiKey.type === ApiKeyBindingType.USER) throw new UnauthorizedException()
		const apiKeyUser = await this.resolveApiKeyPrincipalUser(apiKey)
		if (apiKeyUser) {
			apiKey.user = apiKeyUser
			apiKey.userId = apiKeyUser.id
		}

		const principalUser = options?.requestedUserId
			? await this.resolveRequestedUser(apiKey, options.requestedUserId)
			: apiKeyUser

		return buildApiKeyPrincipal(apiKey, {
			actingUser: principalUser,
			requestedUserId: options?.requestedUserId ?? null,
			requestedOrganizationId: options?.requestedOrganizationId ?? apiKey.organizationId ?? null,
			principalType: options?.principalType
		})
	}

	private async resolveApiKeyPrincipalUser(apiKey: IApiKey & { user?: IUser | null; createdBy?: IUser | null }) {
		if (apiKey.user) {
			return apiKey.user
		}

		if (apiKey.userId) {
			try {
				const user = await this.userService.findOneByIdWithinTenant(apiKey.userId, apiKey.tenantId, {
					relations: [...REQUEST_CONTEXT_USER_RELATIONS]
				})
				apiKey.user = user
				return user
			} catch {
				//
			}
		}

		if (apiKey.type === ApiKeyBindingType.INTEGRATION && apiKey.entityId) {
			const integration = await this.integrationService.findOneByIdWithinTenant(
				apiKey.entityId,
				apiKey.tenantId,
				{
					relations: ['user']
				}
			)
			return this.integrationService.ensurePrincipalUser({
				id: integration.id!,
				tenantId: integration.tenantId!,
				organizationId: integration.organizationId,
				name: integration.name,
				slug: integration.slug,
				userId: integration.userId,
				user: integration.user
			})
		}

		if (apiKey.type === ApiKeyBindingType.CLIENT && apiKey.entityId) {
			return this.userService.ensureCommunicationUser({
				tenantId: apiKey.tenantId,
				thirdPartyId: `client:${apiKey.entityId}`,
				username: apiKey.name || apiKey.entityId
			})
		}

		return apiKey.createdBy ?? null
	}

	private async resolveRequestedUser(apiKey: IApiKey & { user?: IUser | null }, requestedUserId: string) {
		if (apiKey.user?.id === requestedUserId) {
			return apiKey.user
		}

		return this.userService.findOneByIdWithinTenant(requestedUserId, apiKey.tenantId, {
			relations: [...REQUEST_CONTEXT_USER_RELATIONS]
		})
	}
}
