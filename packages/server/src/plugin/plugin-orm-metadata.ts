/**
 * Why this exists:
 * Runtime-installed plugins are not automatically part of the live TypeORM `DataSource`.
 * Without merging and rebuilding metadata first, repository access can fail with `EntityMetadataNotFoundError`.
 * Keep registration deterministic, reject entity name conflicts, and only call `synchronize()` when the DataSource is configured for it.
 * Refreshes must retain injected subscribers throughout TypeORM's asynchronous metadata rebuild.
 */
import { BadRequestException, ConflictException, DynamicModule, Type } from '@nestjs/common'
import { DataSource, EntitySubscriberInterface, MixedList, getMetadataArgsStorage } from 'typeorm'
import { getEntitiesFromPlugins, getSubscribersFromPlugins } from './plugin.helper'

type PluginOrmMetadata = {
	entities: Array<Type<any>>
	subscribers: Array<Type<EntitySubscriberInterface>>
}

function normalizeTargets<T>(targets?: MixedList<T>): T[] {
	if (!targets) {
		return []
	}

	if (Array.isArray(targets)) {
		return [...targets]
	}

	if (typeof targets === 'object') {
		return Object.values(targets as Record<string, T>)
	}

	return [targets]
}

function mergeTargets<T>(existing: MixedList<T> | undefined, additions: T[]): T[] {
	return Array.from(new Set([...normalizeTargets(existing), ...additions]))
}

export function collectPluginOrmMetadata(plugins?: Array<Type<any> | DynamicModule>): PluginOrmMetadata {
	return {
		entities: getEntitiesFromPlugins(plugins),
		subscribers: getSubscribersFromPlugins(plugins) as Array<Type<EntitySubscriberInterface>>
	}
}

export function mergeEntityClasses(coreEntities: Array<Type<any>>, pluginEntities: Array<Type<any>>): Array<Type<any>> {
	const registeredEntities = [...coreEntities]

	for (const pluginEntity of pluginEntities) {
		if (registeredEntities.includes(pluginEntity)) {
			continue
		}

		if (registeredEntities.some((entity) => entity.name === pluginEntity.name)) {
			throw new ConflictException({
				message: `Entity conflict: ${pluginEntity.name} conflicts with registered entities.`
			})
		}

		registeredEntities.push(pluginEntity)
	}

	return registeredEntities
}

export function mergeSubscriberClasses(
	coreSubscribers: Array<Type<EntitySubscriberInterface>>,
	pluginSubscribers: Array<Type<EntitySubscriberInterface>>
): Array<Type<EntitySubscriberInterface>> {
	return Array.from(new Set([...coreSubscribers, ...pluginSubscribers]))
}

/**
 * Resolve the physical TypeORM table name declared by an entity class.
 * Namespace validation uses the decorator value instead of the class name.
 */
export function getEntityTableName(entity: Type<any>) {
	const table = getMetadataArgsStorage().tables.find((item) => item.target === entity)
	return typeof table?.name === 'string' && table.name.trim() ? table.name.trim() : null
}

/**
 * Guard plugin entity tables before they are merged into the live DataSource.
 * Explicit namespaces require `plugin_<namespace>_`; legacy plugins still accept the base `plugin_` prefix.
 */
export function validatePluginEntityTableNames(input: {
	pluginName: string
	entities: Array<Type<any>>
	artifactNamespace?: string | null
	requireNamespaceMatch?: boolean
}) {
	if (!input.entities.length) {
		return
	}

	const prefix =
		input.artifactNamespace && input.requireNamespaceMatch ? `plugin_${input.artifactNamespace}_` : 'plugin_'
	const failures = input.entities
		.map((entity) => ({
			entityName: entity.name,
			tableName: getEntityTableName(entity)
		}))
		.filter((item) => !item.tableName?.startsWith(prefix))

	if (!failures.length) {
		return
	}

	throw new BadRequestException({
		message: `Plugin "${input.pluginName}" declares entity table names that do not match required artifact namespace prefix "${prefix}".`,
		failures
	})
}

const metadataRefreshes = new WeakMap<DataSource, Promise<{ changed: boolean; synchronized: boolean }>>()

export async function registerPluginOrmMetadataInDataSource(
	dataSource: DataSource,
	metadata: Partial<PluginOrmMetadata>
) {
	const previous = metadataRefreshes.get(dataSource) ?? Promise.resolve()
	const pending = previous.catch(() => undefined).then(() => registerPluginOrmMetadata(dataSource, metadata))
	metadataRefreshes.set(dataSource, pending)
	try {
		return await pending
	} finally {
		if (metadataRefreshes.get(dataSource) === pending) metadataRefreshes.delete(dataSource)
	}
}

async function rebuildMetadatasPreservingSubscribers(dataSource: DataSource) {
	let subscribers = dataSource.subscribers ?? []
	const descriptor = Object.getOwnPropertyDescriptor(dataSource, 'subscribers')
	// TypeORM replaces this array before awaiting entity metadata. Merge on assignment,
	// so concurrent inserts never observe a window without the injected listeners.
	Object.defineProperty(dataSource, 'subscribers', {
		configurable: true,
		enumerable: descriptor?.enumerable ?? true,
		get: () => subscribers,
		set: (discovered: EntitySubscriberInterface[]) => {
			const existing = new Set(subscribers.map((subscriber) => subscriber.constructor))
			subscribers = [...subscribers, ...discovered.filter((subscriber) => !existing.has(subscriber.constructor))]
		}
	})
	try {
		await (dataSource as DataSource & { buildMetadatas: () => Promise<void> }).buildMetadatas()
	} finally {
		Object.defineProperty(dataSource, 'subscribers', {
			configurable: descriptor?.configurable ?? true,
			enumerable: descriptor?.enumerable ?? true,
			writable: true,
			value: subscribers
		})
	}
}

async function registerPluginOrmMetadata(dataSource: DataSource, metadata: Partial<PluginOrmMetadata>) {
	const nextEntities = mergeTargets(dataSource.options.entities, metadata.entities ?? [])
	const nextSubscribers = mergeTargets(dataSource.options.subscribers, metadata.subscribers ?? [])
	const hasEntityChanges = nextEntities.length !== normalizeTargets(dataSource.options.entities).length
	const hasSubscriberChanges = nextSubscribers.length !== normalizeTargets(dataSource.options.subscribers).length

	if (!hasEntityChanges && !hasSubscriberChanges) {
		return { changed: false, synchronized: false }
	}

	dataSource.setOptions({
		entities: nextEntities,
		subscribers: nextSubscribers
	})

	if (!dataSource.isInitialized) {
		return { changed: true, synchronized: false }
	}

	await rebuildMetadatasPreservingSubscribers(dataSource)

	if (hasEntityChanges && dataSource.options.synchronize) {
		await dataSource.synchronize()
		return { changed: true, synchronized: true }
	}

	return { changed: true, synchronized: false }
}
