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
		const providers = [
			...Object.values(INTEGRATION_PROVIDERS),
			...this.strategyRegistry.list(RequestContext.getOrganizationId()).map((strategy) => strategy.meta)
		]
		return providers
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
