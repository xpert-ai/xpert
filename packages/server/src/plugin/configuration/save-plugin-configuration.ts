// Configuration writes must never replace the identity of a concurrently staged installation.
// Keep row locks within this database-only transaction; synchronize live config after commit.
import { ConflictException } from '@nestjs/common'
import { t } from 'i18next'
import type { FindOptionsWhere, Repository } from 'typeorm'
import type { PluginInstance } from '../plugin-instance.entity'
import { serializePluginConfig } from '../plugin-config.crypto'
import { normalizePluginSourceConfig } from '../source-config'

export async function savePluginConfiguration(
	repository: Repository<PluginInstance>,
	input: PluginInstance,
	where: FindOptionsWhere<PluginInstance>[]
) {
	const configuration = {
		config: serializePluginConfig(input.config),
		configurationStatus: input.configurationStatus ?? null,
		configurationError: input.configurationError ?? null
	}
	await repository.manager.transaction(async (manager) => {
		const repo = manager.getRepository(repository.target)
		const query = { where, select: { id: true, scopeKey: true }, lock: { mode: 'pessimistic_write' as const } }
		let existing = await repo.findOne(query)
		if (!existing) {
			await repo.createQueryBuilder().insert().values({
				tenantId: input.tenantId,
				organizationId: input.organizationId,
				scopeKey: input.scopeKey,
				pluginName: input.pluginName,
				packageName: input.packageName,
				version: input.version,
				source: input.source,
				sourceConfig: normalizePluginSourceConfig(input.source, input.sourceConfig),
				level: input.level,
				...configuration
			}).orIgnore().execute()
			// Another first save or installation may have inserted the row while we waited.
			existing = await repo.findOne(query)
		}
		if (!existing?.id) {
			throw new ConflictException(t('server-ai:Error.PluginConfigurationSaveConflict', {
				defaultValue: 'The plugin installation changed while saving configuration. Reload and try again.'
			}))
		}
		// Retain the existing save path's normalization of legacy unscoped records.
		const legacyScope = existing.scopeKey == null ? {
			scopeKey: input.scopeKey, tenantId: input.tenantId, organizationId: input.organizationId
		} : {}
		await repo.update({ id: existing.id }, { ...configuration, ...legacyScope })
	})
}
