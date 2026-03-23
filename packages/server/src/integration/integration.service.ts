import { IIntegration, INTEGRATION_PROVIDERS } from '@metad/contracts'
import { Injectable, Logger } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { IntegrationStrategyRegistry, RequestContext } from '@xpert-ai/plugin-sdk'
import { FindOneOptions, FindOptionsWhere, Repository } from 'typeorm'
import { QueryDeepPartialEntity } from 'typeorm/query-builder/QueryPartialEntity'
import { TenantOrganizationAwareCrudService } from './../core/crud'
import { Integration } from './integration.entity'

@Injectable()
export class IntegrationService extends TenantOrganizationAwareCrudService<Integration> {
	private readonly logger = new Logger(IntegrationService.name)

	constructor(
		@InjectRepository(Integration)
		integrationRepository: Repository<Integration>,
		private readonly strategyRegistry: IntegrationStrategyRegistry,
	) {
		super(integrationRepository)
	}

	getProviders() {
		const providers = new Map<string, any>()

		for (const provider of Object.values(INTEGRATION_PROVIDERS)) {
			providers.set(provider.name, provider)
		}

		// Prefer plugin-registered strategies when they override a builtin provider
		for (const provider of this.strategyRegistry.list(RequestContext.getOrganizationId()).map((strategy) => strategy.meta)) {
			providers.set(provider.name, provider)
		}

		return Array.from(providers.values())
	}

	getIntegrationStrategy(type: string) {
		return this.strategyRegistry.get(type, RequestContext.getOrganizationId())
	}

	async test(integration: IIntegration) {
		const strategy = this.getIntegrationStrategy(integration.provider)
		return strategy.validateConfig(integration.options, integration)
	}

	async update(
		id: string | number | FindOptionsWhere<Integration>,
		partialEntity: QueryDeepPartialEntity<Integration>,
		...options: any[]
	) {
		const integrationId =
			typeof id === 'string' ? id : typeof id === 'number' ? String(id) : (id as { id?: string })?.id
		const previous = integrationId ? await this.readOneById(integrationId) : null
		const result = await super.update(id, partialEntity, ...options)

		if (!previous) {
			return result
		}

		const strategy = this.getIntegrationStrategy(previous.provider)
		if (!strategy?.onUpdate) {
			return result
		}

		try {
			await strategy.onUpdate(previous as unknown as IIntegration, this.mergeUpdatedIntegration(previous, partialEntity))
		} catch (error) {
			this.logger.warn(
				`Post-update integration hook failed for ${integrationId ?? 'unknown'}: ${
					error instanceof Error ? error.message : String(error)
				}`
			)
		}

		return result
	}

	readOneById(id: string, options?: FindOneOptions<Integration>) {
		return this.repository.findOne({ ...(options ?? {}), where: { id } })
	}

	private mergeUpdatedIntegration(
		previous: Integration,
		partialEntity: QueryDeepPartialEntity<Integration>
	): IIntegration<any> {
		const next = {
			...previous,
			...partialEntity
		} as Integration

		if ('options' in partialEntity && partialEntity.options && typeof partialEntity.options === 'object') {
			next.options = {
				...(previous.options ?? {}),
				...(partialEntity.options as Record<string, unknown>)
			} as any
		}

		return next as unknown as IIntegration<any>
	}
}
