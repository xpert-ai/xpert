import type { DataSource } from 'typeorm'
import type { EntityMetadata } from 'typeorm/metadata/EntityMetadata'

/** Restrict DDL on a disposable migration connection, keeping reference metadata available. */
export function scopePluginSchemaSynchronization(
	dataSource: Pick<DataSource, 'entityMetadatas'>,
	pluginEntities: ReadonlyArray<EntityMetadata['target']>,
	artifactNamespace?: string | null
): void {
	const targets = new Set(pluginEntities)
	const owned = new Set(dataSource.entityMetadatas.filter((metadata) => targets.has(metadata.target)))
	for (const metadata of owned) {
		if (metadata.closureJunctionTable) owned.add(metadata.closureJunctionTable)
		for (const relation of metadata.relations) {
			if (relation.isOwning && relation.junctionEntityMetadata) owned.add(relation.junctionEntityMetadata)
		}
	}

	const prefix = artifactNamespace ? `plugin_${artifactNamespace}_` : 'plugin_'
	for (const metadata of owned) {
		if (!metadata.tableName.startsWith(prefix)) {
			throw new Error(
				`Plugin schema synchronization cannot modify table "${metadata.tablePath}" outside "${prefix}".`
			)
		}
	}
	for (const metadata of dataSource.entityMetadatas) {
		metadata.synchronize = metadata.synchronize && owned.has(metadata)
	}
}
