import type { IXpertAgent, TXpertGraph, TXpertTeamConnection } from '@xpert-ai/contracts'
import type { TXpertAgentRuntimeOptions } from './state'

const SUB_AGENT_CONNECTION_TYPES = new Set<TXpertTeamConnection['type']>(['agent', 'xpert'])

export function normalizeSubAgentConnectionNodeKey(key?: string | null): string {
	return key?.split('/')?.[0]?.trim() ?? ''
}

export function getSubAgentConnectionTargetKey(connection: TXpertTeamConnection): string {
	return normalizeSubAgentConnectionNodeKey(connection.to)
}

export function isRequiredSubAgentConnection(connection?: Pick<TXpertTeamConnection, 'required'> | null): boolean {
	return connection?.required !== false
}

export function getAgentSubAgentConnections(graph: TXpertGraph, agentKey: string): TXpertTeamConnection[] {
	const normalizedAgentKey = normalizeSubAgentConnectionNodeKey(agentKey)
	return (
		graph.connections?.filter(
			(connection) =>
				SUB_AGENT_CONNECTION_TYPES.has(connection.type) &&
				normalizeSubAgentConnectionNodeKey(connection.from) === normalizedAgentKey
		) ?? []
	)
}

export function getRuntimeEnabledSubAgentConnections(
	graph: TXpertGraph,
	agent: Pick<IXpertAgent, 'key'>,
	options?: Pick<TXpertAgentRuntimeOptions, 'runtimeCapabilities'>
): TXpertTeamConnection[] {
	const connections = getAgentSubAgentConnections(graph, agent.key)
	const runtimeCapabilities = options?.runtimeCapabilities
	if (runtimeCapabilities?.mode !== 'allowlist') {
		return connections
	}

	const selectedSubAgentKeys = runtimeCapabilities.subAgents?.nodeKeys ?? []
	const selectedSubAgentNodeKeys = new Set(
		selectedSubAgentKeys.map((key) => normalizeSubAgentConnectionNodeKey(key)).filter(Boolean)
	)
	return connections.filter(
		(connection) =>
			isRequiredSubAgentConnection(connection) ||
			selectedSubAgentNodeKeys.has(getSubAgentConnectionTargetKey(connection))
	)
}
