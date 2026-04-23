import { BadRequestException } from '@nestjs/common'
import {
	createProjectId,
	createSprintId,
	ProjectSprintStrategyEnum,
	ProjectSwimlaneKindEnum,
	ProjectSystemSwimlaneKeyEnum
} from '@xpert-ai/contracts'
import { Repository } from 'typeorm'
import { ProjectSprint } from '../project-sprint/project-sprint.entity'
import { ProjectSwimlane } from './project-swimlane.entity'
import { ProjectSwimlaneService } from './project-swimlane.service'

describe('ProjectSwimlaneService', () => {
	let service: ProjectSwimlaneService
	let swimlaneRepository: {
		create: jest.Mock
		save: jest.Mock
		findOne: jest.Mock
	}
	let sprintRepository: {
		findOneBy: jest.Mock
	}
	const projectId = createProjectId('project-1')
	const sprintId = createSprintId('sprint-1')

	beforeEach(() => {
		swimlaneRepository = {
			create: jest.fn((value) => value),
			save: jest.fn(async (value) => value),
			findOne: jest.fn()
		}
		sprintRepository = {
			findOneBy: jest.fn()
		}

		service = new ProjectSwimlaneService(
			swimlaneRepository as unknown as Repository<ProjectSwimlane>,
			sprintRepository as unknown as Repository<ProjectSprint>
		)
	})

	it('builds the default software delivery swimlanes', () => {
		const swimlanes = service.buildDefaultSwimlanes({
			id: sprintId,
			projectId,
			strategyType: ProjectSprintStrategyEnum.SoftwareDelivery
		})

		expect(swimlanes.map(({ key }) => key)).toEqual([
			ProjectSystemSwimlaneKeyEnum.Backlog,
			'planning',
			'coding',
			'review',
			'release'
		])
		expect(swimlanes[0]).toEqual(
			expect.objectContaining({
				kind: ProjectSwimlaneKindEnum.Backlog,
				sortOrder: 0,
				concurrencyLimit: 0,
				wipLimit: 0
			})
		)
		expect(swimlanes).toHaveLength(5)
	})

	it('builds the default data analysis swimlanes', () => {
		const swimlanes = service.buildDefaultSwimlanes({
			id: sprintId,
			projectId,
			strategyType: ProjectSprintStrategyEnum.DataAnalysis
		})

		expect(swimlanes.map(({ key }) => key)).toEqual([
			ProjectSystemSwimlaneKeyEnum.Backlog,
			'research',
			'analysis',
			'visualization'
		])
		expect(swimlanes).toHaveLength(4)
	})

	it('rejects unsupported strategies', () => {
		expect(() =>
			service.getStrategyTemplateOrFail('unsupported_strategy' as ProjectSprintStrategyEnum)
		).toThrow(BadRequestException)
	})

	it('writes default swimlanes into the sprint scope when creating them', async () => {
		await service.createDefaultsForSprint({
			id: sprintId,
			projectId,
			strategyType: ProjectSprintStrategyEnum.SoftwareDelivery,
			tenantId: 'tenant-1',
			organizationId: 'org-1'
		})

		expect(swimlaneRepository.create).toHaveBeenCalledWith(
			expect.objectContaining({
				projectId,
				sprintId,
				tenantId: 'tenant-1',
				organizationId: 'org-1'
			})
		)
		expect(swimlaneRepository.save).toHaveBeenCalledWith(
			expect.arrayContaining([
				expect.objectContaining({
					projectId,
					sprintId,
					tenantId: 'tenant-1',
					organizationId: 'org-1'
				})
			])
		)
	})
})
