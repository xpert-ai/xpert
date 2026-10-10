import { Logger } from '@nestjs/common'
import { ModuleRef } from '@nestjs/core'
import { PLUGIN_JOB_PROCESSOR_METADATA, STRATEGY_META_KEY, StrategyBus } from '@xpert-ai/plugin-sdk'
import { collectProvidersWithMetadata } from './plugin.helper'
import { PluginInstallInput } from './types'

export async function registerInstalledPluginStrategies(
	loadedModuleRef: ModuleRef,
	scopeKey: string,
	body: PluginInstallInput,
	logger: Logger,
	beforeModuleIds: Set<string>,
	strategyBus: StrategyBus,
	targetOrganizationId: string
) {
	const strategyProviders = collectProvidersWithMetadata(
		loadedModuleRef,
		scopeKey,
		body.pluginName,
		logger,
		beforeModuleIds
	)

	for await (const instance of strategyProviders) {
		const target = instance.metatype ?? instance.constructor
		const sourceId = `${scopeKey}:${body.pluginName}@${body.version ?? 'latest'}:${target.name}`
		let strategyMeta: string = null
		if (instance.metatype) {
			strategyMeta = Reflect.getMetadata(STRATEGY_META_KEY, instance.metatype)
		}
		if (!strategyMeta) {
			strategyMeta = Reflect.getMetadata(STRATEGY_META_KEY, instance.constructor)
		}
		let managedQueueProcessorMeta: unknown = null
		if (instance.metatype) {
			managedQueueProcessorMeta = Reflect.getMetadata(PLUGIN_JOB_PROCESSOR_METADATA, instance.metatype)
		}
		if (!managedQueueProcessorMeta) {
			managedQueueProcessorMeta = Reflect.getMetadata(PLUGIN_JOB_PROCESSOR_METADATA, instance.constructor)
		}
		if (strategyMeta) {
			logger.debug(
				`Registering strategy ${strategyMeta} for plugin ${body.pluginName} in organization ${targetOrganizationId}`
			)
			strategyBus.upsert(strategyMeta, {
				instance,
				sourceId,
				sourceKind: 'plugin'
			})
		}
		if (Array.isArray(managedQueueProcessorMeta) && managedQueueProcessorMeta.length) {
			logger.debug(
				`Registering managed queue processor for plugin ${body.pluginName} in organization ${targetOrganizationId}`
			)
			strategyBus.upsert(PLUGIN_JOB_PROCESSOR_METADATA, {
				instance,
				sourceId,
				sourceKind: 'plugin'
			})
		}
		if (!strategyMeta && !(Array.isArray(managedQueueProcessorMeta) && managedQueueProcessorMeta.length)) {
			logger.debug(
				`No strategy or managed queue processor metadata found for provider '${instance.constructor.name}' in plugin ${body.pluginName}, skipping registration into strategy bus`
			)
		}
	}
}
