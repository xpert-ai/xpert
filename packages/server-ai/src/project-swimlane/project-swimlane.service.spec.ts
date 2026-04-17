import { BadRequestException } from '@nestjs/common'
import { ProjectSprintStrategyEnum } from '@xpert-ai/contracts'
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

		expect(swimlanes.map(({ key }) => key)).toEqual(['planning', 'coding', 'review', 'release'])
		expect(swimlanes).toHaveLength(4)
	})

	it('builds the default data analysis swimlanes', () => {
		const swimlanes = service.buildDefaultSwimlanes({
			id: 'sprint-1',
			projectId: 'project-1',
			strategyType: ProjectSprintStrategyEnum.DataAnalysis
		})

		expect(swimlanes.map(({ key }) => key)).toEqual(['research', 'analysis', 'visualization'])
		expect(swimlanes).toHaveLength(3)
	})

	it('rejects unsupported strategies', () => {
		expect(() =>
			service.getStrategyTemplateOrFail('unsupported_strategy' as ProjectSprintStrategyEnum)
		).toThrow(BadRequestException)
	})
})
