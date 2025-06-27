import { ICopilotModel, IXpertAgent, mapTranslationLanguage, TXpertGraph, TXpertTeamNode } from '@metad/contracts'
import { nonNullable } from '@metad/copilot'
import { pick } from '@metad/server-common'
import { RequestContext } from '@metad/server-core'
import { IQueryHandler, QueryHandler, QueryBus } from '@nestjs/cqrs'
import { I18nService } from 'nestjs-i18n'
import { XpertService } from '../../xpert.service'
import { CopilotGetOneQuery } from '../../../copilot'
import { GetXpertWorkflowQuery } from '../get-xpert-workflow.query'


@QueryHandler(GetXpertWorkflowQuery)
export class GetXpertWorkflowHandler implements IQueryHandler<GetXpertWorkflowQuery> {
	constructor(
		private readonly service: XpertService,
		private readonly i18nService: I18nService,
		private readonly queryBus: QueryBus,
	) {}

	public async execute(command: GetXpertWorkflowQuery): Promise<{agent?: IXpertAgent; graph: TXpertGraph; next?: TXpertTeamNode[]; fail?: TXpertTeamNode[]}> {
		const { id, agentKey: keyOrName, draft } = command
		const xpert = await this.service.findOne(id, {
			relations: ['agent', 'agent.copilotModel', 'copilotModel', 'copilotModel.copilot', 'agents', 'agents.copilotModel', 'knowledgebases', 'toolsets', 'executors']
		})
		const tenantId = xpert.tenantId

		if (draft && xpert.draft) {
			const draft = xpert.draft
			const nodes = draft.nodes ?? xpert.graph.nodes
			const connections = draft.connections ?? xpert.graph.connections
			const agentNode = nodes?.find((_) => _.type === 'agent' && (_.key === keyOrName || _.entity.name === keyOrName))
			if (!agentNode) {
				throw new Error(await this.i18nService.translate('xpert.Error.NoAgentInGraph', {
					lang: mapTranslationLanguage(RequestContext.getLanguageCode()),
					args: {
						value: keyOrName
					}
				}))
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

			const next = connections
				.filter((_) => _.type === 'edge' && _.from === agentKey)
				.map((conn) => nodes.find((_) => (_.type === 'agent' || _.type === 'workflow') && _.key === conn.to))
			const fail = connections
				.filter((_) => _.type === 'edge' && _.from === (agentKey + '/fail'))
				.map((conn) => nodes.find((_) => (_.type === 'agent' || _.type === 'workflow') && _.key === conn.to))
			
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
				graph: {nodes, connections},
				next,
				fail
			}
		} else {
			const agents = [xpert.agent, ...xpert.agents]
			const agent = keyOrName ? agents.find((_) => _.key === keyOrName || _.name === keyOrName) : xpert.agent
			if (agent) {
				const next = xpert.graph?.connections
					.filter((_) => _.type === 'edge' && _.from === agent.key)
					.map((conn) => xpert.graph.nodes.find((_) => (_.type === 'agent' || _.type === 'workflow') && _.key === conn.to))
				const fail = xpert.graph?.connections
					.filter((_) => _.type === 'edge' && _.from === (agent.key + '/fail'))
					.map((conn) => xpert.graph.nodes.find((_) => (_.type === 'agent' || _.type === 'workflow') && _.key === conn.to))
				await this.fillCopilot(tenantId, agent.copilotModel)
				return {
					agent: {
						...agent,
						followers: [xpert.agent, ...xpert.agents].filter((_) => _.leaderKey === agent.key),
						collaborators: agent.collaboratorNames?.map((name) => xpert.executors.find((_) => _.name === name)).filter(nonNullable),
						team: xpert
					},
					graph: xpert.graph,
					next,
					fail
				}
			}
		}

		return {
			graph: xpert.graph,
		}
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
