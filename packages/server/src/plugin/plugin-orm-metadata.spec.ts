import { ConflictException } from '@nestjs/common'

jest.mock('./plugin.helper', () => ({
	getEntitiesFromPlugins: jest.fn(() => []),
	getSubscribersFromPlugins: jest.fn(() => [])
}))

import {
	mergeEntityClasses,
	mergeSubscriberClasses,
	registerPluginOrmMetadataInDataSource
} from './plugin-orm-metadata'

class CoreEntity {}
class PluginEntity {}
class CoreSubscriber {}
class PluginSubscriber {}

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
