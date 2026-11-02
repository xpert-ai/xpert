import { BadRequestException, ConflictException } from '@nestjs/common'
import { Column, DataSource, Entity, PrimaryGeneratedColumn } from 'typeorm'

jest.mock('./plugin.helper', () => ({
	getEntitiesFromPlugins: jest.fn(() => []),
	getSubscribersFromPlugins: jest.fn(() => [])
}))

import { registerPluginEntityOwnership } from './plugin-entity-policy'

import {
	getEntityTableName,
	mergeEntityClasses,
	mergeSubscriberClasses,
	registerPluginOrmMetadataInDataSource,
	validatePluginEntityTableNames
} from './plugin-orm-metadata'

class CoreEntity {}
class PluginEntity {}
class CoreSubscriber {}
class PluginSubscriber {}

@Entity('plugin_office_editor_document')
class OfficeDocumentEntity {}

@Entity('plugin_other_document')
class OtherDocumentEntity {}

describe('plugin orm metadata helpers', () => {
	it('merges plugin entities into the registered entity list', () => {
		expect(mergeEntityClasses([CoreEntity], [PluginEntity])).toEqual([CoreEntity, PluginEntity])
	})

	it('rejects plugin entities that conflict by class name', () => {
		const ConflictingEntity = class CoreEntity {}

		expect(() => mergeEntityClasses([CoreEntity], [ConflictingEntity as typeof CoreEntity])).toThrow(
			ConflictException
		)
	})

	it.each(['plugin_scoped_history', 'plugin_other_history'])(
		'preserves scoped entity constructors when their class names match (%s)',
		async (secondTable) => {
			const createEntity = (table: string) => {
				@Entity(table)
				class SettingsHistory {
					@PrimaryGeneratedColumn('uuid')
					id: string

					@Column({ type: 'uuid' })
					organizationId: string
				}
				return SettingsHistory
			}
			const first = createEntity('plugin_scoped_history')
			const second = createEntity(secondTable)
			for (const entity of [first, second]) {
				registerPluginEntityOwnership([entity], {
					pluginName: 'scoped',
					artifactNamespace: 'scoped',
					version: '1.0.0'
				})
			}
			const entities = mergeEntityClasses([], [first, second, first])
			expect(entities).toEqual([first, second])

			class MetadataDataSource extends DataSource {
				async prepareMetadata() {
					await this.buildMetadatas()
				}
			}
			const database = new MetadataDataSource({ type: 'postgres', entities })
			await database.prepareMetadata()
			expect(database.getMetadata(first).target).toBe(first)
			expect(database.getMetadata(second).target).toBe(second)
			expect(database.getMetadata(first).tableName).toBe('plugin_scoped_history')
			expect(database.getMetadata(second).tableName).toBe(secondTable)
		}
	)

	it('allows matching core and plugin class names with different explicit table mappings', () => {
		const core = class LearningEventEntity {}
		const plugin = class LearningEventEntity {}
		Entity('agent_evolution_learning_event')(core)
		Entity('plugin_learning_event')(plugin)
		expect(mergeEntityClasses([core], [plugin])).toEqual([core, plugin])
	})

	it.each([undefined, 'public'])(
		'rejects a plugin that maps to a core table with another class name (schema=%s)',
		(schema) => {
			class HostData {}
			class PluginData {}
			Entity('host_data', { schema })(HostData)
			Entity('host_data', { schema: 'public' })(PluginData)
			expect(() => mergeEntityClasses([HostData], [PluginData])).toThrow(ConflictException)
		}
	)

	it('distinguishes explicit schemas when checking core table conflicts', () => {
		const core = class History {}
		const plugin = class History {}
		Entity('history', { schema: 'host' })(core)
		Entity('history', { schema: 'plugin' })(plugin)
		expect(mergeEntityClasses([core], [plugin])).toEqual([core, plugin])
	})

	it('deduplicates plugin subscribers', () => {
		expect(mergeSubscriberClasses([CoreSubscriber], [CoreSubscriber, PluginSubscriber] as any)).toEqual([
			CoreSubscriber,
			PluginSubscriber
		])
	})

	it('reads TypeORM entity table names from decorators', () => {
		expect(getEntityTableName(OfficeDocumentEntity)).toBe('plugin_office_editor_document')
	})

	it('validates plugin entity table names against the declared namespace', () => {
		expect(() =>
			validatePluginEntityTableNames({
				pluginName: '@xpert-ai/plugin-office-editor',
				entities: [OfficeDocumentEntity],
				artifactNamespace: 'office_editor',
				level: 'tenant'
			})
		).not.toThrow()

		expect(() =>
			validatePluginEntityTableNames({
				pluginName: '@xpert-ai/plugin-office-editor',
				entities: [OtherDocumentEntity],
				artifactNamespace: 'office_editor',
				level: 'tenant'
			})
		).toThrow(BadRequestException)
	})

	it.each([undefined, '', 'INVALID'])(
		'rejects entity plugins without a valid explicit namespace (%s)',
		(artifactNamespace) => {
			expect(() =>
				validatePluginEntityTableNames({
					pluginName: 'legacy',
					entities: [OtherDocumentEntity],
					artifactNamespace,
					level: 'tenant'
				})
			).toThrow(BadRequestException)
		}
	)

	it('rejects organization-level entities even with a valid namespace', () => {
		expect(() =>
			validatePluginEntityTableNames({
				pluginName: 'legacy',
				entities: [OtherDocumentEntity],
				artifactNamespace: 'other',
				level: 'organization'
			})
		).toThrow('level=system or level=tenant')
	})

	it('does not require entity policy metadata for plugins without entities', () => {
		expect(() =>
			validatePluginEntityTableNames({ pluginName: 'middleware', entities: [], level: 'organization' })
		).not.toThrow()
	})

	it.each(['unverified', 'other-plugin', 'other-version', 'other-schema'])(
		'rejects conflicting physical tables (%s)',
		(variant) => {
			const create = (extra = false) => {
				@Entity('plugin_owned_history')
				class History {
					@PrimaryGeneratedColumn('uuid') id: string
				}
				if (extra) Column({ type: 'text' })(History.prototype, 'extra')
				return History
			}
			const first = create()
			const second = create(variant === 'other-schema')
			if (variant !== 'unverified') {
				registerPluginEntityOwnership([first], {
					pluginName: 'owned',
					artifactNamespace: 'owned',
					version: '1.0.0'
				})
				registerPluginEntityOwnership([second], {
					pluginName: variant === 'other-plugin' ? 'other' : 'owned',
					artifactNamespace: 'owned',
					version: variant === 'other-version' ? '2.0.0' : '1.0.0'
				})
			}
			expect(() => mergeEntityClasses([], [first, second])).toThrow(ConflictException)
		}
	)

	it('refreshes metadata without repeating global DDL after plugin schema preflight', async () => {
		const dataSource = {
			options: {
				entities: [CoreEntity],
				subscribers: [CoreSubscriber],
				synchronize: true
			},
			isInitialized: true,
			setOptions: jest.fn(function (options: Record<string, any>) {
				this.options = { ...this.options, ...options }
				return this
			}),
			buildMetadatas: jest.fn(),
			synchronize: jest.fn()
		}

		await expect(
			registerPluginOrmMetadataInDataSource(dataSource as any, {
				entities: [PluginEntity],
				subscribers: [PluginSubscriber] as any
			})
		).resolves.toEqual({
			changed: true,
			synchronized: false
		})

		expect(dataSource.setOptions).toHaveBeenCalledWith({
			entities: [CoreEntity, PluginEntity],
			subscribers: [CoreSubscriber, PluginSubscriber]
		})
		expect(dataSource.buildMetadatas).toHaveBeenCalledTimes(1)
		expect(dataSource.synchronize).not.toHaveBeenCalled()
	})

	it('only refreshes metadata when schema synchronization is externally managed', async () => {
		const dataSource = {
			options: {
				entities: [CoreEntity],
				subscribers: [CoreSubscriber],
				synchronize: false
			},
			isInitialized: true,
			setOptions: jest.fn(function (options: Record<string, any>) {
				this.options = { ...this.options, ...options }
				return this
			}),
			buildMetadatas: jest.fn(),
			synchronize: jest.fn()
		}

		await expect(
			registerPluginOrmMetadataInDataSource(dataSource as any, {
				entities: [PluginEntity]
			})
		).resolves.toEqual({
			changed: true,
			synchronized: false
		})

		expect(dataSource.buildMetadatas).toHaveBeenCalledTimes(1)
		expect(dataSource.synchronize).not.toHaveBeenCalled()
	})
})
