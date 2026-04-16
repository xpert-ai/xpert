jest.mock('@xpert-ai/server-common', () => ({
	getErrorMessage: (error: Error) => error?.message ?? String(error)
}))

jest.mock('@xpert-ai/server-core', () => ({
	TenantOrganizationAwareCrudService: class TenantOrganizationAwareCrudService<T> {
		protected repository: any

		constructor(repository: any) {
			this.repository = repository
		}

		async create(entity: T) {
			return entity
		}
	},
	TenantOrganizationBaseEntity: class TenantOrganizationBaseEntity {},
	RequestContext: {
		currentTenantId: jest.fn(() => 'tenant-1'),
		getOrganizationId: jest.fn(() => 'org-1')
	}
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
		createQueryBuilder: jest.Mock
	}
	let skillRepositoryService: {
		findOneByIdString: jest.Mock
		localizeRepository: jest.Mock
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
			softDelete: jest.fn().mockResolvedValue({ affected: 1 }),
			createQueryBuilder: jest.fn()
		}
		skillRepositoryService = {
			findOneByIdString: jest.fn().mockResolvedValue({
				id: 'repo-1',
				provider: 'clawhub'
			}),
			localizeRepository: jest.fn((repository) => repository ? { ...repository, name: `${repository.name} (localized)` } : repository),
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
				name: 'Weather draft',
				version: '0.9.0'
			},
			{
				repositoryId: 'repo-1',
				skillId: 'weather',
				skillPath: 'weather',
				name: 'Weather latest',
				version: '1.0.0'
			},
			{
				repositoryId: 'repo-1',
				skillId: 'calendar',
				skillPath: 'calendar',
				name: 'Calendar latest',
				version: '2.0.0'
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
				name: 'Weather latest',
				version: '1.0.0'
			})
		)
		expect(createSpy).toHaveBeenNthCalledWith(
			2,
			expect.objectContaining({
				id: 'calendar-id',
				repositoryId: 'repo-1',
				skillId: 'calendar',
				name: 'Calendar latest',
				version: '2.0.0'
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
				name: 'Weather latest',
				version: '1.0.0'
			}),
			expect.objectContaining({
				id: 'calendar-id',
				skillId: 'calendar',
				name: 'Calendar latest',
				version: '2.0.0'
			})
		])
		expect(skillRepositoryService.updateLastSyncAt).toHaveBeenCalledWith('repo-1')
	})

	it('builds a searchable marketplace query with pagination and repository filter', async () => {
		const queryBuilder = {
			leftJoinAndSelect: jest.fn().mockReturnThis(),
			where: jest.fn().mockReturnThis(),
			andWhere: jest.fn().mockReturnThis(),
			orderBy: jest.fn().mockReturnThis(),
			addOrderBy: jest.fn().mockReturnThis(),
			skip: jest.fn().mockReturnThis(),
			take: jest.fn().mockReturnThis(),
			getManyAndCount: jest.fn().mockResolvedValue([
				[
					{
						id: 'skill-1',
						repositoryId: 'repo-1',
						skillId: 'weather',
						skillPath: 'weather',
						name: 'Weather',
						repository: {
							id: 'repo-1',
							name: 'Workspace Shared Skills',
							provider: 'workspace-public'
						}
					}
				],
				1
			])
		}
		repository.createQueryBuilder.mockReturnValue(queryBuilder)

		const result = await service.findMarketplace(
			{
				where: { repositoryId: 'repo-1' },
				take: 24,
				skip: 48,
				order: { updatedAt: 'DESC' as any }
			} as any,
			'weather'
		)

		expect(repository.createQueryBuilder).toHaveBeenCalledWith('skill')
		expect(queryBuilder.leftJoinAndSelect).toHaveBeenCalledWith('skill.repository', 'repository')
		expect(queryBuilder.skip).toHaveBeenCalledWith(48)
		expect(queryBuilder.take).toHaveBeenCalledWith(24)
		expect(queryBuilder.addOrderBy).toHaveBeenCalledWith('skill.updatedAt', 'DESC')
		expect(queryBuilder.getManyAndCount).toHaveBeenCalled()
		expect(skillRepositoryService.localizeRepository).toHaveBeenCalledWith(
			expect.objectContaining({
				id: 'repo-1',
				name: 'Workspace Shared Skills'
			})
		)
		expect(result).toEqual({
			items: [
				expect.objectContaining({
					id: 'skill-1',
					skillId: 'weather',
					repository: expect.objectContaining({
						name: 'Workspace Shared Skills (localized)'
					})
				})
			],
			total: 1
		})
	})
})
