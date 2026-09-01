import type { Repository } from 'typeorm'
import { BaseEntity } from '../entities/internal'
import { CrudService } from './crud.service'

class TestEntity extends BaseEntity {}

class TestCrudService extends CrudService<TestEntity> {
	constructor(repository: Repository<TestEntity>) {
		super(repository)
	}
}

describe('CrudService id scoping', () => {
	it.each(['findOne', 'findOneByIdString', 'findOneOrFailByIdString'] as const)(
		'keeps the route id authoritative in %s',
		async (method) => {
			const record = Object.assign(new TestEntity(), { id: 'route-id' })
			const repository = {
				findOne: jest.fn().mockResolvedValue(record),
				findOneOrFail: jest.fn().mockResolvedValue(record)
			}
			const service = new TestCrudService(repository as unknown as Repository<TestEntity>)

			await service[method]('route-id', {
				where: { id: 'victim-id' }
			})

			const query = (repository.findOne.mock.calls[0] ?? repository.findOneOrFail.mock.calls[0])[0]
			expect(query.where).toEqual({ id: 'route-id' })
		}
	)

	it('keeps the route id authoritative for every OR branch', async () => {
		const repository = {
			findOne: jest.fn().mockResolvedValue(Object.assign(new TestEntity(), { id: 'route-id' }))
		}
		const service = new TestCrudService(repository as unknown as Repository<TestEntity>)

		await service.findOne('route-id', {
			where: [{ id: 'victim-a' }, { id: 'victim-b' }]
		})

		expect(repository.findOne).toHaveBeenCalledWith({
			where: [{ id: 'route-id' }, { id: 'route-id' }]
		})
	})
})
