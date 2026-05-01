import {
	getRuntimeEnabledSubAgentConnections,
	getSubAgentConnectionTargetKey,
	isRequiredSubAgentConnection
} from './sub-agent'

describe('sub-agent runtime selection', () => {
	it('treats omitted required as required', () => {
		expect(isRequiredSubAgentConnection({})).toBe(true)
		expect(isRequiredSubAgentConnection({ required: true })).toBe(true)
		expect(isRequiredSubAgentConnection({ required: false })).toBe(false)
	})

	it('keeps all sub-agent connections when no runtime allow-list is provided', () => {
		const graph = {
			nodes: [],
			connections: [
				{ key: 'agent-1/required-agent', type: 'agent', from: 'agent-1', to: 'required-agent' },
				{ key: 'agent-1/optional-agent', type: 'agent', from: 'agent-1', to: 'optional-agent', required: false },
				{ key: 'agent-1/optional-xpert', type: 'xpert', from: 'agent-1', to: 'optional-xpert', required: false }
			]
		} as any

		expect(getRuntimeEnabledSubAgentConnections(graph, { key: 'agent-1' }).map(getSubAgentConnectionTargetKey)).toEqual([
			'required-agent',
			'optional-agent',
			'optional-xpert'
		])
	})

	it('keeps required and selected optional sub-agent connections for runtime allow-lists', () => {
		const graph = {
			nodes: [],
			connections: [
				{ key: 'agent-1/required-agent', type: 'agent', from: 'agent-1', to: 'required-agent' },
				{ key: 'agent-1/optional-agent', type: 'agent', from: 'agent-1', to: 'optional-agent', required: false },
				{ key: 'agent-1/optional-xpert', type: 'xpert', from: 'agent-1', to: 'optional-xpert', required: false }
			]
		} as any

		expect(
			getRuntimeEnabledSubAgentConnections(graph, { key: 'agent-1' }, {
				runtimeCapabilities: {
					mode: 'allowlist',
					skills: { ids: [] },
					plugins: { nodeKeys: [] },
					subAgents: { nodeKeys: ['optional-xpert'] }
				}
			}).map(getSubAgentConnectionTargetKey)
		).toEqual(['required-agent', 'optional-xpert'])
	})

	it('ignores connection keys in runtime allow-lists', () => {
		const graph = {
			nodes: [],
			connections: [
				{ key: 'agent-1/required-agent', type: 'agent', from: 'agent-1', to: 'required-agent' },
				{ key: 'agent-1/optional-agent', type: 'agent', from: 'agent-1', to: 'optional-agent', required: false },
				{ key: 'agent-1/optional-xpert', type: 'xpert', from: 'agent-1', to: 'optional-xpert', required: false }
			]
		} as any

		expect(
			getRuntimeEnabledSubAgentConnections(graph, { key: 'agent-1' }, {
				runtimeCapabilities: {
					mode: 'allowlist',
					skills: { ids: [] },
					plugins: { nodeKeys: [] },
					subAgents: { nodeKeys: ['agent-1/optional-agent'] }
				}
			}).map(getSubAgentConnectionTargetKey)
		).toEqual(['required-agent'])
	})
})
