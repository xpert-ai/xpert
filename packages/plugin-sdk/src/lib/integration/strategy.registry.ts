import { Injectable, OnModuleInit } from '@nestjs/common'
import { DiscoveryService, Reflector } from '@nestjs/core'
import { INTEGRATION_STRATEGY } from './strategy.decorator'
import { IntegrationStrategy } from './strategy.interface'

@Injectable()
export class IntegrationStrategyRegistry implements OnModuleInit {
	private strategies = new Map<string, IntegrationStrategy>()

	constructor(
		private discoveryService: DiscoveryService,
		private reflector: Reflector
	) {}

	onModuleInit() {
		const providers = this.discoveryService.getProviders()
		for (const wrapper of providers) {
			const { instance } = wrapper
			if (!instance) continue

			const type = this.reflector.get<string>(INTEGRATION_STRATEGY, instance.constructor)
			if (type) {
				this.strategies.set(type, instance as IntegrationStrategy)
			}
		}
	}

	get(type: string): IntegrationStrategy {
		const strategy = this.strategies.get(type)
		if (!strategy) {
			throw new Error(`No strategy found for type ${type}`)
		}
		return strategy
	}

	list(): IntegrationStrategy[] {
		return Array.from(this.strategies.values())
	}
}
