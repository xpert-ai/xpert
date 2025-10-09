import { KnowledgeProviderEnum } from '@metad/contracts'
import { Injectable, OnModuleInit } from '@nestjs/common'
import { DiscoveryService, Reflector } from '@nestjs/core'
import { KNOWLEDGE_STRATEGY } from './knowledge-strategy.decorator'
import { KnowledgeStrategy } from './knowledge-strategy.interface'

@Injectable()
export class KnowledgeStrategyRegistry implements OnModuleInit {
	private strategies = new Map<KnowledgeProviderEnum, KnowledgeStrategy>()

	constructor(
		private discoveryService: DiscoveryService,
		private reflector: Reflector
	) {}

	onModuleInit() {
		const providers = this.discoveryService.getProviders()
		for (const wrapper of providers) {
			const { instance } = wrapper
			if (!instance) continue

			const type = this.reflector.get<KnowledgeProviderEnum>(KNOWLEDGE_STRATEGY, instance.constructor)
			if (type) {
				this.strategies.set(type, instance as KnowledgeStrategy)
			}
		}
	}

	get(type: KnowledgeProviderEnum): KnowledgeStrategy {
		const strategy = this.strategies.get(type)
		if (!strategy) {
			throw new Error(`No strategy found for type ${type}`)
		}
		return strategy
	}
}
