import { INTEGRATION_PROVIDERS } from '@metad/contracts'
import { Injectable } from '@nestjs/common'
import { CommandBus } from '@nestjs/cqrs'
import { InjectRepository } from '@nestjs/typeorm'
import { IntegrationStrategyRegistry } from '@xpert-ai/plugin-sdk'
import { Repository } from 'typeorm'
import { TenantOrganizationAwareCrudService } from './../core/crud'
import { Integration } from './integration.entity'

@Injectable()
export class IntegrationService extends TenantOrganizationAwareCrudService<Integration> {
	constructor(
		@InjectRepository(Integration)
		private readonly integrationRepository: Repository<Integration>,
		private readonly strategyRegistry: IntegrationStrategyRegistry,
		private readonly commandBus: CommandBus
	) {
		super(integrationRepository)
	}

	getProviders() {
		const providers = [
			...Object.values(INTEGRATION_PROVIDERS),
			...this.strategyRegistry.list().map((strategy) => strategy.meta)
		]
		return providers
	}

	getIntegrationStrategy(type: string) {
		return this.strategyRegistry.get(type)
	}
}
