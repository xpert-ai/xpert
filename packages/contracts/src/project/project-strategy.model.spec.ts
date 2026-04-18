import {
	ProjectSprintStrategyEnum,
	ProjectSwimlaneKindEnum,
	ProjectSystemSwimlaneKeyEnum
} from './project-strategy.model'

describe('project strategy contracts', () => {
	it('defines the built-in sprint strategies', () => {
		expect(Object.values(ProjectSprintStrategyEnum)).toEqual(['software_delivery', 'data_analysis'])
	})

	it('defines the built-in swimlane kinds and reserved keys', () => {
		expect(Object.values(ProjectSwimlaneKindEnum)).toEqual(['backlog', 'execution'])
		expect(ProjectSystemSwimlaneKeyEnum.Backlog).toBe('backlog')
	})
})
