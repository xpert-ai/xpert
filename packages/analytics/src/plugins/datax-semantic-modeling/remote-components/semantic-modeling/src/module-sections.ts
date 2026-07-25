import { Section } from './studio-types'

export type StudioModuleSection = Exclude<
	Section,
	| 'relationships'
	| 'overview'
	| 'sources'
	| 'queryLab'
	| 'validation'
	| 'dimensionEditor'
	| 'virtualCubeEditor'
	| 'json'
>

const studioModuleSections = new Set<Section>([
	'dimensions',
	'cubes',
	'virtualCubes',
	'calculations',
	'members',
	'quality',
	'security',
	'operations',
	'settings'
])

export function isStudioModuleSection(section: Section): section is StudioModuleSection {
	return studioModuleSections.has(section)
}
