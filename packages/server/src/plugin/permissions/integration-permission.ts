import { IIntegration, IPagination, IntegrationUsage, IntegrationUsageScope } from '@xpert-ai/contracts'
import { Injectable } from '@nestjs/common'
import { QueryBus } from '@nestjs/cqrs'
import { ModuleRef } from '@nestjs/core'
import { InjectRepository } from '@nestjs/typeorm'
import {
	IntegrationPermissionService,
	RequestContext,
	PluginWebhookCredentialResult,
	ResolveConnectorIntegrationQuery
} from '@xpert-ai/plugin-sdk'
import { FindManyOptions, FindOneOptions, Repository } from 'typeorm'
import { canConsumeIntegration } from '../../integration/sharing/integration-sharing.policy'
import {
	projectIntegrationPolicyFields,
	selectIntegrationPolicyFields
} from '../../integration/sharing/integration-projection'
import { IntegrationService } from '../../integration/integration.service'
import { Integration } from '../../core/entities/internal'
import { PLUGIN_WEBHOOK_CREDENTIAL_SERVICE_TOKEN } from '../plugin-webhook.tokens'
import { readIntegrationConfiguration, type PluginPermissionScope } from './integration-configuration'

type PluginWebhookCredentialServiceLike = {
	ensureCredential(
		id: string,
		options?: {
			provider?: string | null
			rotateIfRevoked?: boolean
		}
	): Promise<PluginWebhookCredentialResult>
	rotateCredential(
		id: string,
		options?: {
			provider?: string | null
		}
	): Promise<PluginWebhookCredentialResult>
	revokeCredential(
		id: string,
		options?: {
			provider?: string | null
		}
	): Promise<boolean>
}

@Injectable()
export class PluginIntegrationPermissionService implements IntegrationPermissionService {
	constructor(
		private readonly moduleRef: ModuleRef,
		private readonly queries: QueryBus,
		@InjectRepository(Integration) private readonly integrationRepository: Repository<Integration>
	) {}

	async readForUsage(id: string, usage: IntegrationUsage, scope: IntegrationUsageScope) {
		if (!id || !scope.tenantId) return null
		const integration = await this.integrationRepository.findOne({ where: { id, tenantId: scope.tenantId } })
		return integration && canConsumeIntegration(integration, scope, usage) ? integration : null
	}

	readConfiguration(id: string, scope?: PluginPermissionScope, providers: readonly string[] = []) {
		return readIntegrationConfiguration(this.integrationRepository, id, scope, providers)
	}

	readForConnector(id: string, provider: string, scope: { tenantId: string; organizationId: string | null }) {
		return this.queries.execute(new ResolveConnectorIntegrationQuery(id, provider, scope))
	}

	async read<TIntegration = IIntegration>(
		id: string,
		options?: FindOneOptions<Integration>
	): Promise<TIntegration | null> {
		if (!id) {
			return null
		}

		let integrationService: IntegrationService
		try {
			integrationService = this.moduleRef.get<IntegrationService>(IntegrationService, {
				strict: false
			})
		} catch {
			return null
		}
		if (!integrationService) {
			return null
		}

		try {
			return (await integrationService.readOneById(id, options)) as TIntegration
		} catch {
			return null
		}
	}

	async ensureWebhookCredential(
		id: string,
		options?: {
			provider?: string | null
			rotateIfRevoked?: boolean
		}
	): Promise<PluginWebhookCredentialResult | null> {
		const service = this.resolveWebhookCredentialService()
		if (!id || !service) {
			return null
		}
		try {
			return await service.ensureCredential(id, options)
		} catch {
			return null
		}
	}

	async rotateWebhookCredential(
		id: string,
		options?: {
			provider?: string | null
		}
	): Promise<PluginWebhookCredentialResult | null> {
		const service = this.resolveWebhookCredentialService()
		if (!id || !service) {
			return null
		}
		try {
			return await service.rotateCredential(id, options)
		} catch {
			return null
		}
	}

	async revokeWebhookCredential(
		id: string,
		options?: {
			provider?: string | null
		}
	): Promise<boolean> {
		const service = this.resolveWebhookCredentialService()
		if (!id || !service) {
			return false
		}
		try {
			return await service.revokeCredential(id, options)
		} catch {
			return false
		}
	}

	private resolveIntegrationService(): IntegrationService | null {
		try {
			return this.moduleRef.get<IntegrationService>(IntegrationService, {
				strict: false
			})
		} catch {
			return null
		}
	}

	private resolveWebhookCredentialService(): PluginWebhookCredentialServiceLike | null {
		try {
			return this.moduleRef.get<PluginWebhookCredentialServiceLike>(PLUGIN_WEBHOOK_CREDENTIAL_SERVICE_TOKEN, {
				strict: false
			})
		} catch {
			return null
		}
	}

	async findAll<TIntegration = IIntegration>(
		options?: FindManyOptions<Integration>
	): Promise<IPagination<TIntegration>> {
		const integrationService = this.resolveIntegrationService()
		if (!integrationService) {
			return { items: [], total: 0 }
		}

		try {
			const result = await integrationService.findAll(options)
			return {
				items: (result?.items ?? []) as TIntegration[],
				total: result?.total ?? 0
			}
		} catch {
			return { items: [], total: 0 }
		}
	}

	async findAllWithInheritance<TIntegration = IIntegration>(
		options?: FindManyOptions<Integration>
	): Promise<IPagination<TIntegration>> {
		const integrationService = this.resolveIntegrationService()
		if (!integrationService) {
			return { items: [], total: 0 }
		}

		try {
			const scope = RequestContext.getScope()
			const result = await integrationService.findWithInheritance(
				options?.select ? { ...options, select: selectIntegrationPolicyFields(options.select) } : options
			)
			const items = (result?.items ?? [])
				.filter((item) => canConsumeIntegration(item, scope, 'configuration'))
				.map((item) => projectIntegrationPolicyFields(item, options?.select))
			return { items: items as TIntegration[], total: items.length }
		} catch {
			return { items: [], total: 0 }
		}
	}
}
