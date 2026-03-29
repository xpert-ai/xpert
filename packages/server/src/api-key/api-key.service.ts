import { ApiKeyBindingType, ApiPrincipalType, IApiKey, IApiPrincipal, IUser } from '@metad/contracts'
import { Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { nanoid } from 'nanoid'
import { Repository } from 'typeorm'
import { TenantOrganizationAwareCrudService } from '../core/crud'
import { IntegrationService } from '../integration'
import { UserService } from '../user/user.service'
import { buildApiKeyPrincipal } from './api-key-principal'
import { ApiKey } from './api-key.entity'

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
		if (!entity.token) {
			entity.token = `sk-x-` + nanoid(100)
		}

		return super.create(entity)
	}

	async resolvePrincipal(
		apiKey: IApiKey & { createdBy?: IUser | null; user?: IUser | null },
		options?: {
			requestedUserId?: string | null
			principalType?: ApiPrincipalType
		}
	): Promise<IApiPrincipal> {
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
			const integration = await this.integrationService.findOneByIdWithinTenant(apiKey.entityId, apiKey.tenantId, {
				relations: ['user']
			})
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

	private async resolveRequestedUser(
		apiKey: IApiKey & { user?: IUser | null },
		requestedUserId: string
	) {
		if (apiKey.user?.id === requestedUserId) {
			return apiKey.user
		}

		return this.userService.findOneByIdWithinTenant(requestedUserId, apiKey.tenantId, {
			relations: [...REQUEST_CONTEXT_USER_RELATIONS]
		})
	}
}
