import { BadRequestException, ConflictException } from '@nestjs/common'
import { Entity } from 'typeorm'

jest.mock('./plugin.helper', () => ({
	getEntitiesFromPlugins: jest.fn(() => []),
	getSubscribersFromPlugins: jest.fn(() => [])
}))

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
				requireNamespaceMatch: true
			})
		).not.toThrow()

		expect(() =>
			validatePluginEntityTableNames({
				pluginName: '@xpert-ai/plugin-office-editor',
				entities: [OtherDocumentEntity],
				artifactNamespace: 'office_editor',
				requireNamespaceMatch: true
			})
		).toThrow(BadRequestException)
	})

	it('allows legacy v1 entity table names when no namespace is explicitly declared', () => {
		expect(() =>
			validatePluginEntityTableNames({
				pluginName: '@xpert-ai/plugin-other',
				entities: [OtherDocumentEntity],
				artifactNamespace: 'other',
				requireNamespaceMatch: false
			})
		).not.toThrow()
	})

	it('refreshes an initialized data source and synchronizes new plugin entities', async () => {
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
			synchronized: true
		})

		expect(dataSource.setOptions).toHaveBeenCalledWith({
			entities: [CoreEntity, PluginEntity],
			subscribers: [CoreSubscriber, PluginSubscriber]
		})
		expect(dataSource.buildMetadatas).toHaveBeenCalledTimes(1)
		expect(dataSource.synchronize).toHaveBeenCalledTimes(1)
	})
})
