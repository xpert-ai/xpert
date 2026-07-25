import { isStudioModuleSection } from './module-sections'

describe('isStudioModuleSection', () => {
	it('accepts generic module pages', () => {
		expect(isStudioModuleSection('dimensions')).toBe(true)
		expect(isStudioModuleSection('virtualCubes')).toBe(true)
		expect(isStudioModuleSection('calculations')).toBe(true)
	})

	it('keeps dedicated editors out of the generic module page', () => {
		expect(isStudioModuleSection('dimensionEditor')).toBe(false)
		expect(isStudioModuleSection('virtualCubeEditor')).toBe(false)
		expect(isStudioModuleSection('queryLab')).toBe(false)
	})
})
