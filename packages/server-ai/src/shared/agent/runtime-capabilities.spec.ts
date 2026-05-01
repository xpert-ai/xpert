import { normalizeRuntimeCapabilitiesSelection } from './runtime-capabilities'

describe('runtime capabilities selection', () => {
	it('normalizes missing sub-agents as an empty allow-list', () => {
		expect(
			normalizeRuntimeCapabilitiesSelection({
				mode: 'allowlist',
				skills: { ids: [' skill-1 '] },
				plugins: { nodeKeys: [' middleware-1 '] }
			})
		).toEqual({
			mode: 'allowlist',
			skills: { ids: ['skill-1'] },
			plugins: { nodeKeys: ['middleware-1'] },
			subAgents: { nodeKeys: [] }
		})
	})

	it('deduplicates and trims sub-agent node keys', () => {
		expect(
			normalizeRuntimeCapabilitiesSelection({
				mode: 'allowlist',
				skills: { ids: [] },
				plugins: { nodeKeys: [] },
				subAgents: { nodeKeys: [' sub-agent ', 'sub-agent', '', null] }
			})
		).toMatchObject({
			subAgents: { nodeKeys: ['sub-agent'] }
		})
	})
})
