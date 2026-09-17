import { DataSource, EntityMetadata, EntitySubscriberInterface } from 'typeorm'
import { Broadcaster } from 'typeorm/subscriber/Broadcaster'

jest.mock('./plugin.helper', () => ({
	getEntitiesFromPlugins: jest.fn(() => []),
	getSubscribersFromPlugins: jest.fn(() => [])
}))

import { registerPluginOrmMetadataInDataSource } from './plugin-orm-metadata'

class CoreEntity {}
class FirstPluginEntity {}
class SecondPluginEntity {}

class RuntimeSubscriber implements EntitySubscriberInterface {
	readonly beforeInsert = jest.fn()
}

class AddedSubscriber implements EntitySubscriberInterface {
	readonly beforeInsert = jest.fn()
}

class RefreshableDataSource extends DataSource {
	readonly duringBuild = jest.fn(() => Promise.resolve())

	constructor() {
		super({ type: 'postgres', entities: [CoreEntity], synchronize: false })
		Object.defineProperty(this, 'isInitialized', { value: true })
	}

	override async buildMetadatas() {
		// TypeORM replaces the subscriber array before awaiting entity metadata construction.
		Object.assign(this, { subscribers: [] })
		await this.duringBuild()
	}
}

describe('runtime subscribers during plugin metadata refresh', () => {
	it('keeps the live listener active while metadata is rebuilding and afterwards', async () => {
		const dataSource = new RefreshableDataSource()
		const subscriber = new RuntimeSubscriber()
		dataSource.subscribers.push(subscriber)
		const broadcaster = new Broadcaster(dataSource.createQueryRunner())
		const metadata = new EntityMetadata({
			connection: dataSource,
			args: { target: CoreEntity, type: 'regular', name: 'core_entity' }
		})
		dataSource.duringBuild.mockImplementation(async () => {
			await broadcaster.broadcast('BeforeInsert', metadata, {})
		})

		await registerPluginOrmMetadataInDataSource(dataSource, { entities: [FirstPluginEntity] })
		expect(subscriber.beforeInsert).toHaveBeenCalledTimes(1)
		await broadcaster.broadcast('BeforeInsert', metadata, {})
		expect(subscriber.beforeInsert).toHaveBeenCalledTimes(2)
		expect(dataSource.subscribers).toEqual([subscriber])
		expect(Object.getOwnPropertyDescriptor(dataSource, 'subscribers')?.get).toBeUndefined()
	})

	it('retains the injected instance once and accepts newly discovered subscribers', async () => {
		const dataSource = new RefreshableDataSource()
		const subscriber = new RuntimeSubscriber()
		const added = new AddedSubscriber()
		dataSource.subscribers.push(subscriber)
		dataSource.duringBuild.mockImplementation(async () => {
			Object.assign(dataSource, { subscribers: [new RuntimeSubscriber(), added] })
		})

		await registerPluginOrmMetadataInDataSource(dataSource, { entities: [FirstPluginEntity] })
		expect(dataSource.subscribers).toEqual([subscriber, added])
	})

	it('serializes concurrent registrations so neither metadata addition is lost', async () => {
		const dataSource = new RefreshableDataSource()
		let active = 0
		let maxActive = 0
		dataSource.duringBuild.mockImplementation(async () => {
			active += 1
			maxActive = Math.max(maxActive, active)
			await new Promise<void>((resolve) => setImmediate(resolve))
			active -= 1
		})

		await Promise.all([
			registerPluginOrmMetadataInDataSource(dataSource, { entities: [FirstPluginEntity] }),
			registerPluginOrmMetadataInDataSource(dataSource, { entities: [SecondPluginEntity] })
		])
		expect(maxActive).toBe(1)
		expect(dataSource.options.entities).toEqual([CoreEntity, FirstPluginEntity, SecondPluginEntity])
	})

	it('preserves listeners after a failure and allows a later registration', async () => {
		const dataSource = new RefreshableDataSource()
		const subscriber = new RuntimeSubscriber()
		dataSource.subscribers.push(subscriber)
		dataSource.duringBuild.mockRejectedValueOnce(new Error('metadata failure'))

		await expect(
			registerPluginOrmMetadataInDataSource(dataSource, { entities: [FirstPluginEntity] })
		).rejects.toThrow('metadata failure')
		expect(dataSource.subscribers).toEqual([subscriber])
		expect(Object.getOwnPropertyDescriptor(dataSource, 'subscribers')?.get).toBeUndefined()
		await expect(
			registerPluginOrmMetadataInDataSource(dataSource, { entities: [SecondPluginEntity] })
		).resolves.toEqual({ changed: true, synchronized: false })
		expect(dataSource.subscribers).toEqual([subscriber])
	})
})
