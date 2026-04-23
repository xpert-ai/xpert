import { BadRequestException } from '@nestjs/common'
import { createProjectId, ProjectSprintStatusEnum, ProjectSprintStrategyEnum } from '@xpert-ai/contracts'
import { RequestContext } from '@xpert-ai/server-core'
import { DataSource, EntityManager, Repository } from 'typeorm'
import { ProjectCore } from '../project-core/project-core.entity'
import { ProjectSwimlaneService } from '../project-swimlane/project-swimlane.service'
import { ProjectSprint } from './project-sprint.entity'
import { ProjectSprintService } from './project-sprint.service'

describe('ProjectSprintService', () => {
	let service: ProjectSprintService
	let sprintRepository: {
		create: jest.Mock
		save: jest.Mock
		update: jest.Mock
	}
	let projectCoreRepository: {
		findOneBy: jest.Mock
	}
	let swimlaneService: {
		getStrategyTemplateOrFail: jest.Mock
		createDefaultsForSprint: jest.Mock
	}
	let manager: {
		getRepository: jest.Mock
	}
	let dataSource: {
		transaction: jest.Mock
	}
	const projectId = createProjectId('project-1')

	beforeEach(() => {
		sprintRepository = {
			create: jest.fn((value) => value),
			save: jest.fn(async (value) => ({ id: 'sprint-1', ...value })),
			update: jest.fn()
		}
		projectCoreRepository = {
			findOneBy: jest.fn().mockResolvedValue({ id: 'project-1' })
		}
		swimlaneService = {
			getStrategyTemplateOrFail: jest.fn(),
			createDefaultsForSprint: jest.fn().mockResolvedValue([])
		}
		manager = {
			getRepository: jest.fn().mockReturnValue(sprintRepository)
		}
		dataSource = {
			transaction: jest.fn(async (callback: (entityManager: EntityManager) => unknown) =>
				callback(manager as unknown as EntityManager)
			)
		}

		service = new ProjectSprintService(
			sprintRepository as unknown as Repository<ProjectSprint>,
			projectCoreRepository as unknown as Repository<ProjectCore>,
			dataSource as unknown as DataSource,
			swimlaneService as unknown as ProjectSwimlaneService
		)
	})

	afterEach(() => {
		jest.restoreAllMocks()
	})

	it('creates a sprint and generates the default swimlanes in the same transaction', async () => {
		jest.spyOn(RequestContext, 'currentTenantId').mockReturnValue('tenant-1')
		jest.spyOn(RequestContext, 'getOrganizationId').mockReturnValue('org-1')

		const sprint = await service.create({
			projectId,
			goal: 'Ship the MVP',
			strategyType: ProjectSprintStrategyEnum.SoftwareDelivery
		})

		expect(dataSource.transaction).toHaveBeenCalled()
		expect(sprintRepository.create).toHaveBeenCalledWith(
			expect.objectContaining({
				projectId,
				status: ProjectSprintStatusEnum.Planned,
				tenantId: 'tenant-1',
				organizationId: 'org-1'
			})
		)
		expect(swimlaneService.getStrategyTemplateOrFail).toHaveBeenCalledWith(
			ProjectSprintStrategyEnum.SoftwareDelivery
		)
		expect(swimlaneService.createDefaultsForSprint).toHaveBeenCalledWith(
			expect.objectContaining({
				id: 'sprint-1',
				projectId: 'project-1',
				status: ProjectSprintStatusEnum.Planned,
				tenantId: 'tenant-1',
				organizationId: 'org-1'
			}),
			manager
		)
		expect(sprint).toEqual(
			expect.objectContaining({
				id: 'sprint-1',
				projectId: 'project-1',
				strategyType: ProjectSprintStrategyEnum.SoftwareDelivery
			})
		)
	})

	it('rejects missing sprint strategies', async () => {
		await expect(
			service.create({
				projectId,
				goal: 'Ship the MVP'
			})
		).rejects.toBeInstanceOf(BadRequestException)
	})

	it('rejects changing the sprint strategy after creation', async () => {
		jest.spyOn(service, 'findOne').mockResolvedValue({
			id: 'sprint-1',
			projectId: 'project-1',
			goal: 'Current goal',
			status: ProjectSprintStatusEnum.Planned,
			strategyType: ProjectSprintStrategyEnum.SoftwareDelivery
		} as ProjectSprint)

		await expect(
			service.update('sprint-1', {
				strategyType: ProjectSprintStrategyEnum.DataAnalysis
			})
		).rejects.toBeInstanceOf(BadRequestException)
	})
})
