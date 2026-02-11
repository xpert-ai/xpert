import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit, Optional } from '@nestjs/common'
import { DiscoveryService, Reflector } from '@nestjs/core'
import { RequestContext } from '@metad/server-core'
import {
	GLOBAL_ORGANIZATION_SCOPE,
	ORGANIZATION_METADATA_KEY,
	PLUGIN_METADATA_KEY,
	StrategyBus
} from '@xpert-ai/plugin-sdk'
import { Subscription, filter } from 'rxjs'
import {
	HandoffProcessorMetadata,
	IHandoffProcessor,
	IHandoffProcessorRegistry,
	ResolvedHandoffProcessor
} from './processor.interface'
import { HANDOFF_PROCESSOR_META, HANDOFF_PROCESSOR_STRATEGY } from './processor.decorator'

@Injectable()
export class HandoffProcessorRegistry
	implements IHandoffProcessorRegistry, OnModuleInit, OnModuleDestroy
{
	readonly #logger = new Logger(HandoffProcessorRegistry.name)
	readonly #processorsByOrg = new Map<string, Map<string, ResolvedHandoffProcessor>>()
	readonly #pluginTypesByOrg = new Map<string, Map<string, Set<string>>>()
	private busSub?: Subscription

	constructor(
		private readonly discoveryService: DiscoveryService,
		private readonly reflector: Reflector,
		@Optional() @Inject(StrategyBus) private readonly strategyBus?: StrategyBus
	) {}

	onModuleInit() {
		if (this.strategyBus) {
			this.busSub = this.strategyBus.events$
				.pipe(filter((event) => !event.strategyType || event.strategyType === HANDOFF_PROCESSOR_STRATEGY))
				.subscribe((event) => {
					if (event.type === 'UPSERT') {
						this.upsert(event.entry.instance)
					} else if (event.type === 'REMOVE') {
						this.remove(event.orgId, event.pluginName)
					}
				})
		}

		for (const wrapper of this.discoveryService.getProviders()) {
			if (wrapper?.instance) {
				this.upsert(wrapper.instance)
			}
		}
	}

	onModuleDestroy() {
		this.busSub?.unsubscribe()
	}

	resolve(type: string, organizationId?: string): ResolvedHandoffProcessor {
		const orgId = this.resolveOrganization(organizationId)
		const scoped = this.#processorsByOrg.get(orgId)?.get(type)
		if (scoped) {
			return scoped
		}

		const global = this.#processorsByOrg.get(GLOBAL_ORGANIZATION_SCOPE)?.get(type)
		if (global) {
			return global
		}

		throw new Error(`No handoff processor found for type "${type}" in org "${orgId}"`)
	}

	list(organizationId?: string): ResolvedHandoffProcessor[] {
		const orgId = this.resolveOrganization(organizationId)
		const scoped = Array.from(this.#processorsByOrg.get(orgId)?.values() || [])
		const global =
			orgId === GLOBAL_ORGANIZATION_SCOPE
				? []
				: Array.from(this.#processorsByOrg.get(GLOBAL_ORGANIZATION_SCOPE)?.values() || [])
		return [...scoped, ...global]
	}

	upsert(instance: any) {
		const target = instance.metatype ?? instance.constructor
		const metadata = this.reflector.get<HandoffProcessorMetadata>(HANDOFF_PROCESSOR_META, target)
		if (!metadata?.types?.length) {
			return
		}

		const orgId =
			this.reflector.get<string>(ORGANIZATION_METADATA_KEY, target) ?? GLOBAL_ORGANIZATION_SCOPE
		const pluginName = this.reflector.get<string>(PLUGIN_METADATA_KEY, target)

		let orgMap = this.#processorsByOrg.get(orgId)
		if (!orgMap) {
			orgMap = new Map<string, ResolvedHandoffProcessor>()
			this.#processorsByOrg.set(orgId, orgMap)
		}

		for (const type of metadata.types) {
			const previous = orgMap.get(type)
			if (previous && previous.processor !== instance) {
				this.#logger.warn(
					`Processor type conflict "${type}" in org "${orgId}", overriding ${previous.processor.constructor?.name} with ${instance.constructor?.name}`
				)
			}
			orgMap.set(type, {
				type,
				processor: instance as IHandoffProcessor,
				metadata
			})

			if (pluginName) {
				let pluginOrgMap = this.#pluginTypesByOrg.get(pluginName)
				if (!pluginOrgMap) {
					pluginOrgMap = new Map<string, Set<string>>()
					this.#pluginTypesByOrg.set(pluginName, pluginOrgMap)
				}
				let typeSet = pluginOrgMap.get(orgId)
				if (!typeSet) {
					typeSet = new Set<string>()
					pluginOrgMap.set(orgId, typeSet)
				}
				typeSet.add(type)
			}
		}
	}

	remove(organizationId: string, pluginName: string) {
		const pluginOrgMap = this.#pluginTypesByOrg.get(pluginName)
		const types = pluginOrgMap?.get(organizationId)
		if (!types?.size) {
			return
		}

		const orgMap = this.#processorsByOrg.get(organizationId)
		for (const type of types) {
			orgMap?.delete(type)
		}
		pluginOrgMap?.delete(organizationId)
		if (pluginOrgMap?.size === 0) {
			this.#pluginTypesByOrg.delete(pluginName)
		}
	}

	private resolveOrganization(organizationId?: string): string {
		return organizationId ?? RequestContext.getOrganizationId() ?? GLOBAL_ORGANIZATION_SCOPE
	}
}

