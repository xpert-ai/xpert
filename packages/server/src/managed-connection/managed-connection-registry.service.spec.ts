import { LessThan, MoreThan } from 'typeorm'
import { InstanceRegistryService } from './instance-registry.service'
import { ManagedConnectionRegistryService } from './managed-connection-registry.service'

describe('ManagedConnectionRegistryService', () => {
	let records: any[]
	let repository: {
		create: jest.Mock
		save: jest.Mock
		findOne: jest.Mock
		update: jest.Mock
		createQueryBuilder: jest.Mock
	}
	let service: ManagedConnectionRegistryService

	beforeEach(() => {
		records = []
		repository = {
			create: jest.fn(() => ({})),
			save: jest.fn(async (entity) => {
				if (!entity.id) {
					entity.id = `conn-${records.length + 1}`
				}
				const existingIndex = records.findIndex((record) => record.id === entity.id)
				if (existingIndex >= 0) {
					records[existingIndex] = entity
				} else {
					records.push(entity)
				}
				return entity
			}),
			findOne: jest.fn(async ({ where }) => {
				return records.find((record) => matchesWhere(record, where)) ?? null
			}),
			update: jest.fn(async (criteria, patch) => {
				let affected = 0
				for (const record of records) {
					if (record.status === criteria.status && record.leaseExpiresAt < criteria.leaseExpiresAt.value) {
						Object.assign(record, patch)
						affected += 1
					}
				}
				return { affected }
			}),
			createQueryBuilder: jest.fn()
		}
		service = new ManagedConnectionRegistryService(
			repository as any,
			{ instanceId: 'pod-a' } as InstanceRegistryService
		)
	})

	it('registers a managed connection with an owner lease', async () => {
		const record = await service.register({
			pluginName: '@xpert-ai/plugin-community-wechat',
			connectionType: 'wechat_tunnel',
			connectionKey: 'client-1',
			transportType: 'socket_io',
			remoteAddress: '10.0.0.1',
			metadata: { bindings: [{ uuid: 'uuid-1' }] },
			leaseTtlMs: 1000
		})

		expect(record).toEqual(
			expect.objectContaining({
				pluginName: '@xpert-ai/plugin-community-wechat',
				connectionType: 'wechat_tunnel',
				connectionKey: 'client-1',
				transportType: 'socket_io',
				direction: 'inbound',
				ownerInstanceId: 'pod-a',
				status: 'connected',
				remoteAddress: '10.0.0.1',
				metadata: { bindings: [{ uuid: 'uuid-1' }] }
			})
		)
		expect(record.leaseExpiresAt).toBeInstanceOf(Date)
	})

	it('defaults connection direction to inbound', async () => {
		const record = await service.register({
			pluginName: 'plugin-a',
			connectionType: 'bridge',
			connectionKey: 'client-1',
			transportType: 'websocket'
		})

		expect(record.direction).toBe('inbound')
		expect(records[0].direction).toBe('inbound')
	})

	it('refreshes heartbeat metadata and lease', async () => {
		await service.register({
			pluginName: 'plugin-a',
			connectionType: 'bridge',
			connectionKey: 'client-1',
			transportType: 'websocket',
			metadata: { bindingCount: 1 },
			leaseTtlMs: 1000
		})

		await service.heartbeat({
			pluginName: 'plugin-a',
			connectionType: 'bridge',
			connectionKey: 'client-1',
			metadata: { bindingCount: 2, lastSyncAt: 'now' },
			leaseTtlMs: 2000
		})

		expect(records[0]).toEqual(
			expect.objectContaining({
				status: 'connected',
				metadata: {
					bindingCount: 2,
					lastSyncAt: 'now'
				}
			})
		)
		expect(records[0].leaseExpiresAt.getTime()).toBeGreaterThan(Date.now())
	})

	it('marks expired connected leases as stale', async () => {
		records.push({
			id: 'conn-1',
			status: 'connected',
			leaseExpiresAt: new Date(Date.now() - 1000)
		})

		await expect(service.markExpiredConnectionsStale(new Date())).resolves.toBe(1)
		expect(records[0]).toEqual(
			expect.objectContaining({
				status: 'stale',
				lastError: 'managed connection lease expired'
			})
		)
		expect(repository.update).toHaveBeenCalledWith(
			expect.objectContaining({
				leaseExpiresAt: expect.objectContaining({ _type: 'lessThan' })
			}),
			expect.objectContaining({ status: 'stale' })
		)
	})

	it('returns only active owners', async () => {
		await service.register({
			pluginName: 'plugin-a',
			connectionType: 'bridge',
			connectionKey: 'client-1',
			transportType: 'websocket',
			leaseTtlMs: 1000
		})

		await expect(
			service.getOwner({
				pluginName: 'plugin-a',
				connectionType: 'bridge',
				connectionKey: 'client-1'
			})
		).resolves.toBe('pod-a')
	})

	it('filters list results by direction', async () => {
		const qb = createQueryBuilderMock([
			{
				id: 'conn-1',
				pluginName: 'plugin-a',
				connectionType: 'bridge',
				connectionKey: 'client-1',
				transportType: 'websocket',
				direction: 'outbound',
				ownerInstanceId: 'pod-a',
				status: 'connected',
				metadata: {},
				lastSeenAt: new Date()
			}
		])
		repository.createQueryBuilder.mockReturnValue(qb)

		await expect(
			service.list({
				pluginName: 'plugin-a',
				connectionType: 'bridge',
				direction: 'outbound'
			})
		).resolves.toEqual([
			expect.objectContaining({
				connectionKey: 'client-1',
				direction: 'outbound'
			})
		])

		expect(qb.andWhere).toHaveBeenCalledWith('connection.direction = :direction', { direction: 'outbound' })
	})
})

function matchesWhere(record: any, where: Record<string, any>): boolean {
	return Object.entries(where).every(([key, expected]) => {
		if (expected && typeof expected === 'object' && '_type' in expected) {
			if (expected._type === 'isNull') {
				return record[key] == null
			}
			if (expected._type === 'moreThan') {
				return record[key] > expected.value
			}
		}
		return record[key] === expected
	})
}

function createQueryBuilderMock(rows: any[]) {
	const qb = {
		andWhere: jest.fn(() => qb),
		orderBy: jest.fn(() => qb),
		addOrderBy: jest.fn(() => qb),
		take: jest.fn(() => qb),
		skip: jest.fn(() => qb),
		getMany: jest.fn(async () => rows)
	}
	return qb
}
