import { Injectable, Logger, OnModuleDestroy, OnModuleInit, Optional } from '@nestjs/common'
import { DiscoveryService, Reflector } from '@nestjs/core'
import {
	ORGANIZATION_METADATA_KEY,
	PLUGIN_JOB_PROCESSOR_METADATA,
	StrategyBus,
	type ManagedQueueJob,
	type ManagedQueueJobContext,
	type PluginJobProcessorMetadata
} from '@xpert-ai/plugin-sdk'
import { Subscription } from 'rxjs'
import { ManagedQueueHandlerRegistryService } from './managed-queue-handler-registry.service'

type ProviderWrapperLike = {
	id?: string
	instance?: any
	metatype?: any
}

type RegisteredHandler = {
	pluginName: string
	scopeKey?: string | null
	unregister: () => void
}

@Injectable()
export class ManagedQueueHandlerExplorerService implements OnModuleInit, OnModuleDestroy {
	private readonly logger = new Logger(ManagedQueueHandlerExplorerService.name)
	private readonly registeredHandlers = new Map<string, RegisteredHandler[]>()
	private busSubscription?: Subscription

	constructor(
		private readonly discoveryService: DiscoveryService,
		private readonly reflector: Reflector,
		private readonly registry: ManagedQueueHandlerRegistryService,
		@Optional()
		private readonly strategyBus?: StrategyBus
	) {}

	onModuleInit(): void {
		this.busSubscription = this.strategyBus?.events$.subscribe((event) => {
			if (event.type === 'UPSERT' && event.strategyType === PLUGIN_JOB_PROCESSOR_METADATA) {
				this.upsertInstance(event.entry.instance, event.entry.sourceId)
				return
			}

			if (event.type === 'REMOVE') {
				this.removePluginHandlers(event.orgId, event.pluginName)
			}
		})

		for (const wrapper of this.discoveryService.getProviders() as ProviderWrapperLike[]) {
			const instance = wrapper.instance
			if (!instance) {
				continue
			}
			const sourceId = `provider:${wrapper.id ?? this.getProviderTarget(wrapper, instance)?.name ?? instance.constructor?.name}`
			this.upsertInstance(instance, sourceId, this.getProviderTarget(wrapper, instance))
		}
	}

	onModuleDestroy(): void {
		this.busSubscription?.unsubscribe()
		this.busSubscription = undefined
		for (const sourceId of Array.from(this.registeredHandlers.keys())) {
			this.unregisterSource(sourceId)
		}
	}

	private upsertInstance(instance: any, sourceId: string, explicitTarget?: any): void {
		this.unregisterSource(sourceId)

		const target = explicitTarget ?? instance.metatype ?? instance.constructor
		const metadata = this.getProcessorMetadata(target, instance.constructor)
		if (!metadata.length) {
			return
		}

		const handlerMethod = this.getHandlerMethod(instance)
		if (!handlerMethod) {
			this.logger.warn(
				`Managed queue processor ${instance.constructor?.name ?? sourceId} has @PluginJobProcessor metadata but no handle/process method`
			)
			return
		}

		const scopeKey = this.resolveScopeKey(instance, target)
		const registrations = metadata.map((processor) => {
			const registeredContext: ManagedQueueJobContext = {
				pluginName: processor.pluginName,
				queueName: processor.queueName,
				jobName: processor.jobName,
				scopeKey
			}
			const unregister = this.registry.register({
				pluginName: processor.pluginName,
				queueName: processor.queueName,
				jobName: processor.jobName,
				scopeKey,
				concurrency: processor.concurrency,
				handler: (job: ManagedQueueJob, context: ManagedQueueJobContext) =>
					handlerMethod.call(instance, job, { ...context, ...registeredContext })
			})

			this.logger.debug(
				`Registered managed queue processor ${scopeKey ?? '*'}:${processor.pluginName}/${processor.queueName}/${processor.jobName}`
			)

			return {
				pluginName: processor.pluginName,
				scopeKey,
				unregister
			}
		})

		this.registeredHandlers.set(sourceId, registrations)
	}

	private unregisterSource(sourceId: string): void {
		const registrations = this.registeredHandlers.get(sourceId)
		if (!registrations?.length) {
			return
		}

		for (const registration of registrations) {
			registration.unregister()
		}
		this.registeredHandlers.delete(sourceId)
	}

	private removePluginHandlers(scopeKey: string, pluginName: string): void {
		for (const [sourceId, registrations] of Array.from(this.registeredHandlers.entries())) {
			const keep: RegisteredHandler[] = []
			for (const registration of registrations) {
				if (registration.scopeKey === scopeKey && registration.pluginName === pluginName) {
					registration.unregister()
				} else {
					keep.push(registration)
				}
			}

			if (keep.length) {
				this.registeredHandlers.set(sourceId, keep)
			} else {
				this.registeredHandlers.delete(sourceId)
			}
		}
	}

	private getProviderTarget(wrapper: ProviderWrapperLike, instance: any) {
		return wrapper.metatype ?? instance?.constructor
	}

	private getProcessorMetadata(...targets: any[]): PluginJobProcessorMetadata[] {
		const seen = new Set<any>()
		for (const target of targets) {
			if (!target || seen.has(target)) {
				continue
			}
			seen.add(target)
			const metadata = this.reflector.get<PluginJobProcessorMetadata[]>(PLUGIN_JOB_PROCESSOR_METADATA, target)
			if (Array.isArray(metadata) && metadata.length) {
				return metadata
			}
		}
		return []
	}

	private getHandlerMethod(instance: any) {
		if (typeof instance?.handle === 'function') {
			return instance.handle
		}
		if (typeof instance?.process === 'function') {
			return instance.process
		}
		return null
	}

	private resolveScopeKey(instance: any, target: any): string | null {
		const instanceScope = this.normalizeOptionalString(instance?.scopeKey ?? instance?.pluginContext?.scopeKey)
		if (instanceScope) {
			return instanceScope
		}
		return this.normalizeOptionalString(this.reflector.get<string>(ORGANIZATION_METADATA_KEY, target))
	}

	private normalizeOptionalString(value: unknown): string | null {
		return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null
	}
}
