import { ProjectSprintStrategyEnum } from './project-strategy.model'

describe('project strategy contracts', () => {
	it('defines the built-in sprint strategies', () => {
		expect(Object.values(ProjectSprintStrategyEnum)).toEqual(['software_delivery', 'data_analysis'])
	})
})
