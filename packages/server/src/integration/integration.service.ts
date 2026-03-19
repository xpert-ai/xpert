import { IIntegration, INTEGRATION_PROVIDERS } from '@metad/contracts'
import { Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { IntegrationStrategyRegistry, RequestContext } from '@xpert-ai/plugin-sdk'
import { FindOneOptions, Repository } from 'typeorm'
import { TenantOrganizationAwareCrudService } from './../core/crud'
import { Integration } from './integration.entity'

@Injectable()
export class IntegrationService extends TenantOrganizationAwareCrudService<Integration> {
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

	readOneById(id: string, options?: FindOneOptions<Integration>) {
		return this.repository.findOne({ ...(options ?? {}), where: { id } })
	}
}
