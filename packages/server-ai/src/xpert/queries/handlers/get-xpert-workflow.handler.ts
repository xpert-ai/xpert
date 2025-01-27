import { ICopilotModel, IXpertAgent } from '@metad/contracts'
import { nonNullable } from '@metad/copilot'
import { pick } from '@metad/server-common'
import { IQueryHandler, QueryHandler, QueryBus } from '@nestjs/cqrs'
import { XpertService } from '../../xpert.service'
import { CopilotGetOneQuery } from '../../../copilot'
import { GetXpertWorkflowQuery } from '../get-xpert-workflow.query'


@QueryHandler(GetXpertWorkflowQuery)
export class GetXpertWorkflowHandler implements IQueryHandler<GetXpertWorkflowQuery> {
	constructor(
		private readonly service: XpertService,
		private readonly queryBus: QueryBus
	) {}

	public async execute(command: GetXpertWorkflowQuery): Promise<{agent?: IXpertAgent; next?: any}> {
		const { id, agentKey: keyOrName, draft } = command
		const xpert = await this.service.findOne(id, {
			relations: ['agent', 'agent.copilotModel', 'copilotModel', 'copilotModel.copilot', 'agents', 'agents.copilotModel', 'knowledgebases', 'toolsets', 'executors']
		})
		const tenantId = xpert.tenantId

		if (draft && xpert.draft) {
			const draft = xpert.draft
			const agentNode = draft?.nodes?.find((_) => _.type === 'agent' && (_.key === keyOrName || _.entity.name === keyOrName))
			if (!agentNode) {
				return null
			}
			const agentKey = agentNode.key

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

			const next = draft.connections
				.filter((_) => _.type === 'edge' && _.from === agentKey)
				.map((conn) => draft.nodes.find((_) => (_.type === 'agent' || _.type === 'workflow') && _.key === conn.to))
			
			await this.fillCopilot(tenantId, (<IXpertAgent>agentNode.entity).copilotModel)
			await this.fillCopilot(tenantId, draft.team.copilotModel)
			return {
				agent: {
					...agentNode.entity,
					toolsetIds: toolNodes.filter(nonNullable).map((node) => node.key),
					knowledgebaseIds: knowledgeNodes.filter(nonNullable).map((node) => node.key),
					followers: subAgents.filter(nonNullable).map((node) => node.entity),
					collaborators: collaborators.filter(nonNullable).map((node) => node.entity),
					team: {
						...draft.team,
						...pick(xpert, 'id', 'tenantId', 'organizationId')
					}
				} as IXpertAgent,
				next 
			}
		} else {
			const agents = [xpert.agent, ...xpert.agents]
			const agent = keyOrName ? agents.find((_) => _.key === keyOrName || _.name === keyOrName) : xpert.agent
			if (agent) {
				await this.fillCopilot(tenantId, agent.copilotModel)
				return {
					agent: {
						...agent,
						followers: [xpert.agent, ...xpert.agents].filter((_) => _.leaderKey === agent.key),
						collaborators: agent.collaboratorNames?.map((name) => xpert.executors.find((_) => _.name === name)).filter(nonNullable),
						team: xpert
					},
					next: null
				}
			}
		}

		return {}
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
