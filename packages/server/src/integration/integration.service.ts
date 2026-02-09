import { IIntegration, INTEGRATION_PROVIDERS, TIntegrationProvider } from '@metad/contracts'
import { BadRequestException, HttpException, Injectable } from '@nestjs/common'
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
		const providers = new Map<string, TIntegrationProvider>()
		for (const provider of Object.values(INTEGRATION_PROVIDERS)) {
			if (provider?.name) {
				providers.set(provider.name, provider)
			}
		}
		for (const strategy of this.strategyRegistry.list()) {
			if (strategy.meta?.name) {
				// Strategy metadata overrides static provider metadata if both exist.
				providers.set(strategy.meta.name, strategy.meta)
			}
		}
		return Array.from(providers.values())
	}

	getIntegrationStrategy(type: string) {
		if (!type?.trim()) {
			throw new BadRequestException('Integration provider is required')
		}

		try {
			return this.strategyRegistry.get(type)
		} catch {
			// Backward compatibility for legacy/lowercase provider values in persisted integrations.
			const matched = this.strategyRegistry
				.list()
				.find((strategy) => strategy.meta?.name?.toLowerCase?.() === type.toLowerCase())

			if (matched) {
				return matched
			}

			throw new BadRequestException(`No strategy found for integration provider '${type}'`)
		}
	}

	async test(integration: IIntegration) {
		const strategy = this.getIntegrationStrategy(integration?.provider as string)
		if (typeof strategy.validateConfig !== 'function') {
			throw new BadRequestException(
				`Integration strategy '${integration?.provider}' does not support configuration testing`
			)
		}

		try {
			await strategy.validateConfig(integration?.options)
		} catch (error: unknown) {
			if (error instanceof HttpException) {
				throw error
			}
			const message = (error as Error)?.message || 'Integration config validation failed'
			throw new BadRequestException(message)
		}
	}
}
