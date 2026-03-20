import { TXpertGraph } from '@metad/contracts'
import { getSwarmPartners, normalizeOnChatEventPayload } from './agent'

const graph = {
	nodes: [
		{
			type: 'agent',
			key: 'Agent_0vFB8oULkQ',
			position: {
				x: -300,
				y: 120
			},
			entity: {
				id: '4cf6c8ee-74c4-4211-b251-83035fe572fc'
			},
			hash: '15488a8ae7992d88f927954e45f34c67545e6630744a2984acf826bd07aafadf'
		},
		{
			type: 'agent',
			key: 'Agent_ZFpv3an8VX',
			position: {
				x: 320,
				y: 120
			},
			entity: {
				key: 'Agent_ZFpv3an8VX',
				prompt: ''
			},
			hash: 'c36ce8f9cea694dbc01c7ad9f09fd1d2be78ce09fcbd6125c41cb8de272eb9e3'
		},
		{
			type: 'agent',
			key: 'Agent_OMd2iosOnd',
			position: {
				x: -20,
				y: 400
			},
			entity: {
				type: 'agent',
				key: 'Agent_OMd2iosOnd',
				prompt: ''
			},
			hash: '26bd25c8e71afd1f50673e0967c0ce1edfce4ad4ce369f4eb44fc88c965aec0e'
		}
	],
	connections: [
		{
			type: 'agent',
			key: 'Agent_0vFB8oULkQ/Agent_ZFpv3an8VX',
			from: 'Agent_0vFB8oULkQ',
			to: 'Agent_ZFpv3an8VX'
		},
		{
			type: 'agent',
			key: 'Agent_ZFpv3an8VX/Agent_0vFB8oULkQ',
			from: 'Agent_ZFpv3an8VX',
			to: 'Agent_0vFB8oULkQ'
		},
		{
			type: 'agent',
			key: 'Agent_ZFpv3an8VX/Agent_OMd2iosOnd',
			from: 'Agent_ZFpv3an8VX',
			to: 'Agent_OMd2iosOnd'
		},
		{
			type: 'agent',
			key: 'Agent_OMd2iosOnd/Agent_ZFpv3an8VX',
			from: 'Agent_OMd2iosOnd',
			to: 'Agent_ZFpv3an8VX'
		},
		{
			type: 'agent',
			key: 'Agent_OMd2iosOnd/Agent_0vFB8oULkQ',
			from: 'Agent_OMd2iosOnd',
			to: 'Agent_0vFB8oULkQ'
		},
		{
			type: 'agent',
			key: 'Agent_0vFB8oULkQ/Agent_OMd2iosOnd',
			from: 'Agent_0vFB8oULkQ',
			to: 'Agent_OMd2iosOnd'
		}
	],
	savedAt: '2025-03-26T04:16:23.259Z'
} as TXpertGraph

describe('getSwarmPartners', () => {
	it('should log the graph and agentKey', () => {
		const mockGraph: TXpertGraph = graph // Mock graph object
		const mockAgentKey = 'Agent_0vFB8oULkQ'

		const partners = []
		getSwarmPartners(mockGraph, mockAgentKey, partners)

		console.log(partners)
		expect(partners).toContain('Agent_ZFpv3an8VX')
	})

	it('should log the graph and agentKey', () => {
		const mockGraph = {
			nodes: [
				{
					type: 'agent',
					key: 'Agent_0vFB8oULkQ',
					position: {
						x: -300,
						y: 120
					},
					hash: '15488a8ae7992d88f927954e45f34c67545e6630744a2984acf826bd07aafadf'
				},
				{
					type: 'agent',
					key: 'Agent_ZFpv3an8VX',
					position: {
						x: -80,
						y: 340
					},
					entity: {
						type: 'agent',
						key: 'Agent_ZFpv3an8VX',
						prompt: ''
					},
					hash: '42b07992d4ddf55dbf38347e8ecd99e6d4900568f2fc4bfa74c6d7a8b9e14c8e'
				},
				{
					type: 'agent',
					key: 'Agent_OMd2iosOnd',
					position: {
						x: 300,
						y: 540
					},
					entity: {
						type: 'agent',
						key: 'Agent_OMd2iosOnd',
						prompt: ''
					},
					hash: 'd099c1b0ab02f70b13f1388deb70dc1eff896e18a38cf6dabe34784146ee3227'
				}
			],
			connections: [
				{
					type: 'agent',
					key: 'Agent_0vFB8oULkQ/Agent_ZFpv3an8VX',
					from: 'Agent_0vFB8oULkQ',
					to: 'Agent_ZFpv3an8VX'
				},
				{
					type: 'agent',
					key: 'Agent_ZFpv3an8VX/Agent_0vFB8oULkQ',
					from: 'Agent_ZFpv3an8VX',
					to: 'Agent_0vFB8oULkQ'
				},
				{
					type: 'agent',
					key: 'Agent_ZFpv3an8VX/Agent_OMd2iosOnd',
					from: 'Agent_ZFpv3an8VX',
					to: 'Agent_OMd2iosOnd'
				},
				{
					type: 'agent',
					key: 'Agent_OMd2iosOnd/Agent_ZFpv3an8VX',
					from: 'Agent_OMd2iosOnd',
					to: 'Agent_ZFpv3an8VX'
				}
			]
		} as TXpertGraph
		const mockAgentKey = 'Agent_0vFB8oULkQ'

		const partners = []
		getSwarmPartners(mockGraph, mockAgentKey, partners)

		console.log(partners)

		expect(partners).toContain('Agent_ZFpv3an8VX')
	})
})

describe('normalizeOnChatEventPayload', () => {
	it('adds stable presentation fields for thread context usage events', () => {
		const normalized = normalizeOnChatEventPayload({
			tags: ['thread-1'],
			rest: {
				run_id: 'run-1',
				metadata: {
					__pregel_task_id: 'task-1'
				}
			},
			data: {
				type: 'thread_context_usage',
				runId: 'run-1',
				usage: {
					inputTokens: 120,
					outputTokens: 30,
					contextTokens: 120,
					totalTokens: 150,
					totalPrice: 1.25,
					currency: 'USD'
				}
			}
		})

		expect(normalized).toMatchObject({
			id: 'chat:thread_context_usage:run-1',
			title: 'Thread context usage',
			status: 'info'
		})
		expect(normalized.message).toBe(
			'Total 150 tokens, input 120, output 30, context 120, cost 1.25 USD'
		)
	})
})
