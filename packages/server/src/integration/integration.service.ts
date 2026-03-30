import { IIntegration, INTEGRATION_PROVIDERS } from '@metad/contracts'
import { BadRequestException, Injectable } from '@nestjs/common'
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

	async runStrategyUpdateHook(previous: IIntegration, current: IIntegration) {
		const strategy = previous?.provider ? this.getIntegrationStrategy(previous.provider) : null

		try {
			if (previous?.provider !== current?.provider) {
				await strategy?.onDelete?.(previous)
				return
			}

			await strategy?.onUpdate?.(previous, current)
		} catch (error) {
			throw new BadRequestException(error instanceof Error ? error.message : String(error))
		}
	}

	async runStrategyDeleteHook(integration: IIntegration) {
		const strategy = integration?.provider ? this.getIntegrationStrategy(integration.provider) : null

		try {
			await strategy?.onDelete?.(integration)
		} catch (error) {
			throw new BadRequestException(error instanceof Error ? error.message : String(error))
		}
	}

	readOneById(id: string, options?: FindOneOptions<Integration>) {
		return this.repository.findOne({ ...(options ?? {}), where: { id } })
	}
}
