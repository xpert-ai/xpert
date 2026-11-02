/** Entity ownership is validated before startup registration and schema synchronization. */
import { BadRequestException, ConflictException, Type } from '@nestjs/common'
import type { PluginLevel } from '@xpert-ai/contracts'
import { isPluginArtifactNamespace } from '@xpert-ai/plugin-sdk'
import { getMetadataArgsStorage } from 'typeorm'

/**
 * Resolve the physical TypeORM table name declared by an entity class.
 * Namespace validation uses the decorator value instead of the class name.
 */
export function getEntityTableName(entity: Type<unknown>) {
	const table = getMetadataArgsStorage().tables.find((item) => item.target === entity)
	return typeof table?.name === 'string' && table.name.trim() ? table.name.trim() : null
}

/**
 * Guard plugin entity tables before they are merged into the live DataSource.
 * Every entity-owning plugin must declare an explicit namespace; there is no legacy prefix fallback.
 */
export function validatePluginEntityTableNames(input: {
	pluginName: string
	entities: Array<Type<unknown>>
	artifactNamespace?: string | null
	level?: PluginLevel
}) {
	if (!input.entities.length) {
		return
	}

	if (!isPluginArtifactNamespace(input.artifactNamespace)) {
		throw new BadRequestException(
			`Plugin "${input.pluginName}" declares entities and must declare a valid artifactNamespace.`
		)
	}
	if (input.level !== 'system' && input.level !== 'tenant') {
		throw new BadRequestException(
			`Plugin "${input.pluginName}" declares entities and must use level=system or level=tenant.`
		)
	}
	const prefix = `plugin_${input.artifactNamespace}_`
	const failures = input.entities
		.map((entity) => ({
			entityName: entity.name,
			tableName: getEntityTableName(entity)
		}))
		.filter((item) => !item.tableName?.startsWith(prefix))

	if (!failures.length) {
		return input.artifactNamespace
	}

	throw new BadRequestException({
		message: `Plugin "${input.pluginName}" declares entity table names that do not match required artifact namespace prefix "${prefix}".`,
		failures
	})
}

interface PluginEntityOwner {
	pluginName: string
	artifactNamespace: string
	version: string
}
const entityOwners = new WeakMap<Function, PluginEntityOwner>()

export function registerPluginEntityOwnership(entities: Array<Type<unknown>>, owner: PluginEntityOwner) {
	for (const entity of entities) {
		const previous = entityOwners.get(entity)
		if (
			previous &&
			(previous.pluginName !== owner.pluginName ||
				previous.artifactNamespace !== owner.artifactNamespace ||
				previous.version !== owner.version)
		) {
			throw new ConflictException(`Entity "${entity.name}" is already owned by another plugin or version.`)
		}
	}
	for (const entity of entities) entityOwners.set(entity, { ...owner })
}

function entitySchemaSignature(entity: Function) {
	const storage = getMetadataArgsStorage()
	const targets: Function[] = []
	for (let target = entity; target && target !== Function.prototype; target = Object.getPrototypeOf(target))
		targets.push(target)
	// Include inherited declarations and SQL callbacks. Constructor references differ between installations.
	const declarations = [
		storage.tables,
		storage.columns,
		storage.generations,
		storage.relations,
		storage.joinColumns,
		storage.joinTables,
		storage.indices,
		storage.uniques,
		storage.checks,
		storage.exclusions,
		storage.embeddeds
	].map((entries) =>
		entries
			.filter((entry) => typeof entry.target === 'function' && targets.includes(entry.target))
			.map(({ target, ...definition }) => definition)
	)
	return JSON.stringify(declarations, (_key, value) => (typeof value === 'function' ? value.toString() : value))
}

export function assertCompatiblePluginEntities(existing: readonly unknown[], additions: Array<Type<unknown>>) {
	const tables = getMetadataArgsStorage().tables
	const accepted = [...existing]
	for (const entity of additions) {
		const table = tables.find((entry) => entry.target === entity)
		for (const other of accepted) {
			if (other === entity || typeof other !== 'function') continue
			const previous = tables.find((entry) => entry.target === other)
			const conflicts =
				table?.name && previous?.name
					? table.name === previous.name &&
						(!table.schema || !previous.schema || table.schema === previous.schema)
					: other.name === entity.name
			if (!conflicts) continue
			const owner = entityOwners.get(entity)
			const previousOwner = entityOwners.get(other)
			if (
				!owner ||
				!previousOwner ||
				owner.pluginName !== previousOwner.pluginName ||
				owner.artifactNamespace !== previousOwner.artifactNamespace ||
				owner.version !== previousOwner.version ||
				entitySchemaSignature(entity) !== entitySchemaSignature(other)
			) {
				throw new ConflictException(
					`Entity table conflict: "${table?.name ?? entity.name}" requires the same plugin, namespace, version and schema.`
				)
			}
		}
		accepted.push(entity)
	}
}
