import { ICopilotModel, IXpertAgent } from '@metad/contracts'
import { nonNullable } from '@metad/copilot'
import { pick } from '@metad/server-common'
import { IQueryHandler, QueryBus, QueryHandler } from '@nestjs/cqrs'
import { CopilotGetOneQuery } from '../../../copilot'
import { isKeyEqual } from '../../../shared'
import { XpertService } from '../../xpert.service'
import { GetXpertAgentQuery } from '../get-xpert-agent.query'

@QueryHandler(GetXpertAgentQuery)
export class GetXpertAgentHandler implements IQueryHandler<GetXpertAgentQuery> {
	constructor(
		private readonly service: XpertService,
		private readonly queryBus: QueryBus
	) {}

	public async execute(command: GetXpertAgentQuery): Promise<IXpertAgent> {
		const { id, agentKey: keyOrName, draft } = command
		const xpert = await this.service.findOne(id, {
			relations: [
				'agent',
				'agent.copilotModel',
				'copilotModel',
				'copilotModel.copilot',
				'agents',
				'agents.copilotModel',
				'knowledgebases',
				'toolsets',
				'executors'
			]
		})
		const tenantId = xpert.tenantId

		if (draft && xpert.draft) {
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

			await this.fillCopilot(tenantId, (<IXpertAgent>agentNode.entity).copilotModel)
			await this.fillCopilot(tenantId, draft.team.copilotModel)
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
				await this.fillCopilot(tenantId, agent.copilotModel)
				return {
					...agent,
					followers: [xpert.agent, ...xpert.agents].filter((_) => _.leaderKey === agent.key),
					collaborators: agent.collaboratorNames
						?.map((name) => xpert.executors.find((_) => _.name === name))
						.filter(nonNullable),
					team: xpert
				}
			}
		}

		return null
	}

	/**
	 * Find the runtime copilot fill in the copilot model for agent
	 *
	 * @param copilotModel
	 */
	async fillCopilot(tenantId: string, copilotModel: ICopilotModel) {
		if (copilotModel?.copilotId) {
			copilotModel.copilot = await this.queryBus.execute(
				new CopilotGetOneQuery(tenantId, copilotModel.copilotId, [])
			)
		}
	}
}
