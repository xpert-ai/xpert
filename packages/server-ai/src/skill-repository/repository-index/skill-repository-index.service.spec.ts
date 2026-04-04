jest.mock('@metad/server-common', () => ({
	getErrorMessage: (error: Error) => error?.message ?? String(error)
}))

jest.mock('@metad/server-core', () => ({
	TenantOrganizationAwareCrudService: class TenantOrganizationAwareCrudService<T> {
		protected repository: any

		constructor(repository: any) {
			this.repository = repository
		}

		async create(entity: T) {
			return entity
		}
	},
	TenantOrganizationBaseEntity: class TenantOrganizationBaseEntity {}
}))

jest.mock('@nestjs/typeorm', () => ({
	InjectRepository: () => () => undefined
}))

jest.mock('@xpert-ai/plugin-sdk', () => ({
	SkillSourceProviderRegistry: class SkillSourceProviderRegistry {}
}))

jest.mock('../skill-repository.service', () => ({
	SkillRepositoryService: class SkillRepositoryService {}
}))

jest.mock('./skill-repository-index.entity', () => ({
	SkillRepositoryIndex: class SkillRepositoryIndex {}
}))

import { SkillRepositoryIndexService } from './skill-repository-index.service'

describe('SkillRepositoryIndexService', () => {
	let repository: {
		find: jest.Mock
		softDelete: jest.Mock
	}
	let skillRepositoryService: {
		findOneByIdString: jest.Mock
		updateLastSyncAt: jest.Mock
	}
	let strategy: {
		listSkills: jest.Mock
	}
	let service: SkillRepositoryIndexService
	let createSpy: jest.SpiedFunction<SkillRepositoryIndexService['create']>

	beforeEach(() => {
		repository = {
			find: jest.fn(),
			softDelete: jest.fn().mockResolvedValue({ affected: 1 })
		}
		skillRepositoryService = {
			findOneByIdString: jest.fn().mockResolvedValue({
				id: 'repo-1',
				provider: 'clawhub'
			}),
			updateLastSyncAt: jest.fn().mockResolvedValue(undefined)
		}
		strategy = {
			listSkills: jest.fn()
		}

		service = new SkillRepositoryIndexService(repository as any, skillRepositoryService as any)
		;(service as any).skillSourceProviderRegistry = {
			get: jest.fn().mockReturnValue(strategy)
		}

		createSpy = jest
			.spyOn(service, 'create')
			.mockImplementation(async (item: any) => ({ ...item, id: item.id ?? `saved-${item.skillId}` }))
	})

	afterEach(() => {
		jest.restoreAllMocks()
	})

	it('deduplicates incoming skill ids and cleans duplicate rows during incremental sync', async () => {
		repository.find.mockResolvedValue([
			{
				id: 'weather-newer',
				repositoryId: 'repo-1',
				skillId: 'weather',
				skillPath: 'weather',
				name: 'Weather stale',
				createdAt: new Date('2026-04-03T09:00:00.000Z'),
				updatedAt: new Date('2026-04-04T10:00:00.000Z')
			},
			{
				id: 'weather-older',
				repositoryId: 'repo-1',
				skillId: 'weather',
				skillPath: 'weather',
				name: 'Weather older',
				createdAt: new Date('2026-04-01T09:00:00.000Z'),
				updatedAt: new Date('2026-04-02T10:00:00.000Z')
			},
			{
				id: 'calendar-id',
				repositoryId: 'repo-1',
				skillId: 'calendar',
				skillPath: 'calendar',
				name: 'Calendar stale',
				createdAt: new Date('2026-04-01T09:00:00.000Z'),
				updatedAt: new Date('2026-04-01T10:00:00.000Z')
			}
		])
		strategy.listSkills.mockResolvedValue([
			{
				repositoryId: 'repo-1',
				skillId: 'weather',
				skillPath: 'weather',
				name: 'Weather draft'
			},
			{
				repositoryId: 'repo-1',
				skillId: 'weather',
				skillPath: 'weather',
				name: 'Weather latest'
			},
			{
				repositoryId: 'repo-1',
				skillId: 'calendar',
				skillPath: 'calendar',
				name: 'Calendar latest'
			}
		])

		const result = await service.sync('repo-1', { mode: 'incremental' })

		expect(createSpy).toHaveBeenCalledTimes(2)
		expect(createSpy).toHaveBeenNthCalledWith(
			1,
			expect.objectContaining({
				id: 'weather-newer',
				repositoryId: 'repo-1',
				skillId: 'weather',
				name: 'Weather latest'
			})
		)
		expect(createSpy).toHaveBeenNthCalledWith(
			2,
			expect.objectContaining({
				id: 'calendar-id',
				repositoryId: 'repo-1',
				skillId: 'calendar',
				name: 'Calendar latest'
			})
		)
		expect(repository.softDelete).toHaveBeenCalledTimes(1)
		expect((repository.softDelete.mock.calls[0][0] as any).id).toEqual(
			expect.objectContaining({
				_type: 'in',
				_value: ['weather-older']
			})
		)
		expect(result).toEqual([
			expect.objectContaining({
				id: 'weather-newer',
				skillId: 'weather',
				name: 'Weather latest'
			}),
			expect.objectContaining({
				id: 'calendar-id',
				skillId: 'calendar',
				name: 'Calendar latest'
			})
		])
		expect(skillRepositoryService.updateLastSyncAt).toHaveBeenCalledWith('repo-1')
	})
})
