import { IXpert, IXpertAgent } from '@metad/contracts'
import { nonNullable } from '@metad/ocap-core'
import { pick } from '@metad/server-common'
import { isKeyEqual } from '../shared'

export function getXpertAgent(xpert: IXpert, keyOrName: string, options: { isDraft: boolean }) {
	const { isDraft } = options
	if (isDraft && xpert.draft) {
		const draft = xpert.draft
		const nodes = draft.nodes ?? xpert.graph.nodes
		const connections = draft.connections ?? xpert.graph.connections
		const agentNode = nodes?.find(
			(_) => _.type === 'agent' && (isKeyEqual(_.key, keyOrName) || isKeyEqual(_.entity.name, keyOrName))
		)
		if (!agentNode) {
			return null
		}
		const agentKey = agentNode.key

		const toolNodes = connections
			.filter((_) => _.type === 'toolset' && _.from === agentKey)
			.map((conn) => nodes.find((_) => _.key === conn.to))

		const knowledgeNodes = connections
			.filter((_) => _.type === 'knowledge' && _.from === agentKey)
			.map((conn) => nodes.find((_) => _.key === conn.to))

		const subAgents = connections
			.filter((_) => _.type === 'agent' && _.from === agentKey)
			.map((conn) => nodes.find((_) => _.type === 'agent' && _.key === conn.to))
		const collaborators = connections
			.filter((_) => _.type === 'xpert' && _.from === agentKey)
			.map((conn) => nodes.find((_) => _.type === 'xpert' && _.key === conn.to))

		return {
			...agentNode.entity,
			toolsetIds: toolNodes.filter(nonNullable).map((node) => node.key),
			knowledgebaseIds: knowledgeNodes.filter(nonNullable).map((node) => node.key),
			followers: subAgents.filter(nonNullable).map((node) => node.entity),
			collaborators: collaborators.filter(nonNullable).map((node) => node.entity),
			team: {
				...draft.team,
				...pick(xpert, 'id', 'tenantId', 'organizationId')
			}
		} as IXpertAgent
	} else {
		const agents = [xpert.agent, ...xpert.agents]
		const agent = keyOrName
			? agents.find((_) => isKeyEqual(_.key, keyOrName) || isKeyEqual(_.name, keyOrName))
			: xpert.agent
		if (agent) {
			return {
				...agent,
				followers: [xpert.agent, ...xpert.agents].filter((_) => _.leaderKey === agent.key),
				collaborators: agent.collaboratorNames
					?.map((name) => xpert.executors.find((_) => _.name === name || _.id === name))
					.filter(nonNullable),
				team: xpert
			}
		}
	}

	return null
}
