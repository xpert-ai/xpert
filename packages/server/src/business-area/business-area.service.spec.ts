import { BadRequestException } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import { getRepositoryToken } from '@nestjs/typeorm'

import { BusinessArea } from './business-area.entity'
import { BusinessAreaService } from './business-area.service'

describe('BusinessAreaService', () => {
	const repository = {
		create: jest.fn((value) => value),
		delete: jest.fn(),
		findAndCount: jest.fn(),
		findOne: jest.fn(),
		save: jest.fn()
	}
	let service: BusinessAreaService

	beforeEach(async () => {
		jest.clearAllMocks()
		const module = await Test.createTestingModule({
			providers: [
				BusinessAreaService,
				{
					provide: getRepositoryToken(BusinessArea),
					useValue: repository
				}
			]
		}).compile()

		service = module.get(BusinessAreaService)
	})

	it('rejects blank names before persisting a business area', async () => {
		await expect(service.createArea({ name: '   ' })).rejects.toBeInstanceOf(BadRequestException)
		expect(repository.save).not.toHaveBeenCalled()
	})

	it('rejects moving a business area below its descendant', async () => {
		repository.findOne
			.mockResolvedValueOnce(Object.assign(new BusinessArea(), { id: 'area-root', name: 'Root' }))
			.mockResolvedValueOnce(
				Object.assign(new BusinessArea(), {
					id: 'area-child',
					name: 'Child',
					parentId: 'area-root'
				})
			)

		await expect(service.updateArea('area-root', { parentId: 'area-child' })).rejects.toBeInstanceOf(
			BadRequestException
		)
		expect(repository.save).not.toHaveBeenCalled()
	})

	it('deletes a business area and allows the tree relation to cascade to descendants', async () => {
		repository.findOne.mockResolvedValueOnce(Object.assign(new BusinessArea(), { id: 'area-root', name: 'Root' }))
		const result = { affected: 1, raw: [] }
		const deleteSpy = jest.spyOn(service, 'delete').mockResolvedValueOnce(result)

		await expect(service.deleteArea('area-root')).resolves.toEqual(result)
		expect(deleteSpy).toHaveBeenCalledWith('area-root')
	})
})
