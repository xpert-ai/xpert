import { ICopilotModel, IXpertAgent } from '@metad/contracts'
import { nonNullable } from '@metad/copilot'
import { pick } from '@metad/server-common'
import { IQueryHandler, QueryHandler, QueryBus } from '@nestjs/cqrs'
import { XpertService } from '../../xpert.service'
import { GetXpertAgentQuery } from '../get-xpert-agent.query'
import { CopilotGetOneQuery } from '../../../copilot'


@QueryHandler(GetXpertAgentQuery)
export class GetXpertAgentHandler implements IQueryHandler<GetXpertAgentQuery> {
	constructor(
		private readonly service: XpertService,
		private readonly queryBus: QueryBus
	) {}

	public async execute(command: GetXpertAgentQuery): Promise<IXpertAgent> {
		const { id, agentKey, draft } = command
		const xpert = await this.service.findOne(id, {
			relations: ['agent', 'agent.copilotModel', 'copilotModel', 'copilotModel.copilot', 'agents', 'agents.copilotModel', 'knowledgebases', 'toolsets', 'executors']
		})
		const tenantId = xpert.tenantId

		if (draft && xpert.draft) {
			const draft = xpert.draft
			const agentNode = draft?.nodes?.find((_) => _.key === agentKey)
			if (!agentNode) {
				return null
			}

			const toolNodes = draft.connections
				.filter((_) => _.type === 'toolset' && _.from === agentKey)
				.map((conn) => draft.nodes.find((_) => _.key === conn.to))

			const knowledgeNodes = draft.connections
				.filter((_) => _.type === 'knowledge' && _.from === agentKey)
				.map((conn) => draft.nodes.find((_) => _.key === conn.to))

			const subAgents = draft.connections
				.filter((_) => _.type === 'agent' && _.from === agentKey)
				.map((conn) => draft.nodes.find((_) => _.type === 'agent' && _.key === conn.to))
			const collaborators = draft.connections
				.filter((_) => _.type === 'xpert' && _.from === agentKey)
				.map((conn) => draft.nodes.find((_) => _.type === 'xpert' && _.key === conn.to))
			
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
			const agent = agentKey ? agents.find((_) => _.key === agentKey) : xpert.agent
			if (agent) {
				await this.fillCopilot(tenantId, agent.copilotModel)
				return {
					...agent,
					followers: [xpert.agent, ...xpert.agents].filter((_) => _.leaderKey === agent.key),
					collaborators: agent.collaboratorNames?.map((name) => xpert.executors.find((_) => _.name === name)).filter(nonNullable),
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
			copilotModel.copilot = await this.queryBus.execute(new CopilotGetOneQuery(tenantId, copilotModel.copilotId, []))
		}
	}
}
