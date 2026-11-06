// Invariants: readers capture the installation identity, never request scope or mutable plugin context.
// Each call reads committed configuration; failures must not fall back to stale credentials.
import { Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import {
	GLOBAL_ORGANIZATION_SCOPE,
	SYSTEM_GLOBAL_SCOPE,
	type PluginContext,
	type XpertPlugin
} from '@xpert-ai/plugin-sdk'
import { IsNull, type Repository } from 'typeorm'
import { inspectConfig } from '../config'
import { deserializePluginConfigStrict } from '../plugin-config.crypto'
import { PluginInstance } from '../plugin-instance.entity'
import { getCodeRuntimeName } from '../source-config'
import { type LoadedPluginRecord, normalizePluginName } from '../types'

type ConfigurationRuntime = Omit<LoadedPluginRecord, 'ctx' | 'instance'> & {
	ctx: Pick<PluginContext<object>, 'config'>
	instance: Pick<XpertPlugin<object>, 'config' | 'meta'>
}

@Injectable()
export class PluginConfigurationReader {
	constructor(
		@InjectRepository(PluginInstance) private readonly repository: Pick<Repository<PluginInstance>, 'findOne'>
	) {}

	createReader(plugin: ConfigurationRuntime): () => Promise<object> {
		const scopeKey = plugin.scopeKey ?? plugin.organizationId
		const tenantId = scopeKey === SYSTEM_GLOBAL_SCOPE ? null : (plugin.tenantId ?? null)
		const organizationId = plugin.organizationId === GLOBAL_ORGANIZATION_SCOPE ? null : plugin.organizationId
		const pluginName = normalizePluginName(plugin.name)
		const version = plugin.instance.meta.version
		const source = plugin.source
		const runtimeName = getCodeRuntimeName(plugin.sourceConfig)
		const spec = plugin.instance.config
		const initialConfig = plugin.ctx.config
		return async () => {
			const row = await this.repository.findOne({
				where: {
					scopeKey,
					pluginName,
					tenantId: tenantId ?? IsNull(),
					organizationId: organizationId ?? IsNull()
				},
				select: [
					'scopeKey',
					'pluginName',
					'tenantId',
					'organizationId',
					'config',
					'version',
					'source',
					'sourceConfig',
					'runtimePublication',
					'configurationStatus'
				]
			})
			// Environment-only plugins have no installation row. A deleted installed plugin is unavailable.
			if (!row && source === 'env') return initialConfig
			if (
				!row ||
				row.scopeKey !== scopeKey ||
				row.pluginName !== pluginName ||
				(row.tenantId ?? null) !== tenantId ||
				(row.organizationId ?? null) !== organizationId
			)
				throw new Error('plugin_configuration_unavailable')
			// A persisted pendingRestart flag may survive boot; compare the actual running artifact.
			if (
				row.runtimePublication ||
				row.version !== version ||
				row.source !== source ||
				getCodeRuntimeName(row.sourceConfig) !== runtimeName
			)
				throw new Error('plugin_configuration_runtime_mismatch')
			try {
				if (row.configurationStatus === 'invalid') throw new Error('Invalid configuration')
				const inspected = inspectConfig<object>(pluginName, deserializePluginConfigStrict(row.config), spec)
				if (inspected.error) throw new Error('Invalid configuration')
				return inspected.config
			} catch {
				// Do not expose ciphertext or schema errors that may contain secrets.
				throw new Error('plugin_configuration_invalid')
			}
		}
	}
}
