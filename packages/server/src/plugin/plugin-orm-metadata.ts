/**
 * Why this exists:
 * Runtime-installed plugins are not automatically part of the live TypeORM `DataSource`.
 * Without merging and rebuilding metadata first, repository access can fail with `EntityMetadataNotFoundError`.
 * Keep registration deterministic, reject entity name conflicts, and only call `synchronize()` when the DataSource is configured for it.
 */
import { ConflictException, DynamicModule, Type } from '@nestjs/common'
import { DataSource, EntitySubscriberInterface, MixedList } from 'typeorm'
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

export function mergeEntityClasses(
	coreEntities: Array<Type<any>>,
	pluginEntities: Array<Type<any>>
): Array<Type<any>> {
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

export async function registerPluginOrmMetadataInDataSource(
	dataSource: DataSource,
	metadata: Partial<PluginOrmMetadata>
) {
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

	await (dataSource as DataSource & { buildMetadatas: () => Promise<void> }).buildMetadatas()

	if (hasEntityChanges && dataSource.options.synchronize) {
		await dataSource.synchronize()
		return { changed: true, synchronized: true }
	}

	return { changed: true, synchronized: false }
}
