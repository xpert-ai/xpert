import { BadRequestException } from '@nestjs/common'
import {
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

	beforeEach(() => {
		service = new ProjectSwimlaneService(
			{} as unknown as Repository<ProjectSwimlane>,
			{} as unknown as Repository<ProjectSprint>
		)
	})

	it('builds the default software delivery swimlanes', () => {
		const swimlanes = service.buildDefaultSwimlanes({
			id: 'sprint-1',
			projectId: 'project-1',
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
			id: 'sprint-1',
			projectId: 'project-1',
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
})
