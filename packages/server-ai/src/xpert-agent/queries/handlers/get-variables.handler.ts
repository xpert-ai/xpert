import {
	isAgentKey,
	IXpertAgent,
	TStateVariable,
	TWorkflowVarGroup,
	TXpertGraph,
	TXpertParameter,
	XpertParameterTypeEnum,
} from '@metad/contracts'
import { CommandBus, IQueryHandler, QueryBus, QueryHandler } from '@nestjs/cqrs'
import { omit, uniq } from 'lodash'
import { BaseToolset, ToolsetGetToolsCommand } from '../../../xpert-toolset'
import { GetXpertAgentQuery } from '../../../xpert/queries/'
import { XpertService } from '../../../xpert/xpert.service'
import {
	STATE_VARIABLE_INPUT,
	STATE_VARIABLE_SYS_LANGUAGE,
	STATE_VARIABLE_USER_EMAIL,
	STATE_VARIABLE_USER_TIMEZONE
} from '../../commands/handlers/types'
import { XpertAgentVariablesQuery } from '../get-variables.query'
import { getAgentVarGroup } from '../../agent'

@QueryHandler(XpertAgentVariablesQuery)
export class XpertAgentVariablesHandler implements IQueryHandler<XpertAgentVariablesQuery> {
	constructor(
		private readonly xpertService: XpertService,
		private readonly commandBus: CommandBus,
		private readonly queryBus: QueryBus
	) {}

	public async execute(command: XpertAgentVariablesQuery): Promise<TWorkflowVarGroup[]> {
		const { xpertId, type, nodeKey, isDraft } = command.options

		const xpert = await this.xpertService.findOne(xpertId, { select: ['agentConfig', 'draft', 'graph'] })

		const varGroups: TWorkflowVarGroup[] = [
			{
				variables: [
					{
						name: STATE_VARIABLE_INPUT,
						type: XpertParameterTypeEnum.STRING,
						description: {
							en_US: 'Input',
							zh_Hans: '输入'
						}
					},
					{
						name: STATE_VARIABLE_SYS_LANGUAGE,
						type: XpertParameterTypeEnum.STRING,
						description: {
							en_US: 'Language',
							zh_Hans: '语言'
						}
					},
					{
						name: STATE_VARIABLE_USER_EMAIL,
						type: XpertParameterTypeEnum.STRING,
						description: {
							en_US: 'User email',
							zh_Hans: '用户邮箱'
						}
					},
					{
						name: STATE_VARIABLE_USER_TIMEZONE,
						type: XpertParameterTypeEnum.STRING,
						description: {
							en_US: 'User time zone',
							zh_Hans: '用户时区'
						}
					}
				]
			}
		]

		const agentConfig = isDraft ? xpert.draft?.team?.agentConfig ?? xpert.agentConfig : xpert.agentConfig
		const stateVariables = agentConfig?.stateVariables
		if (stateVariables) {
			varGroups[0].variables.push(...stateVariables)
		}

		// All agents output
		const graph = isDraft ? {...(xpert.graph ?? {}), ...(xpert.draft ?? {})} as TXpertGraph : xpert.graph

		if (type === 'agent') {
			const agent = await this.queryBus.execute<GetXpertAgentQuery, IXpertAgent>(
				new GetXpertAgentQuery(xpertId, nodeKey, isDraft)
			)
			if (!agent) {
				return varGroups
			}

			if (nodeKey) {
				const toolsets = await this.commandBus.execute<ToolsetGetToolsCommand, BaseToolset[]>(
					new ToolsetGetToolsCommand(agent.toolsetIds)
				)

				if (nodeKey && agent.parameters) {
					varGroups[0].variables.push(...agent.parameters.map(xpertParameterToVariable))
				}

				for await (const toolset of toolsets) {
					await toolset.initTools()
					const toolVars = toolset.getVariables()
					if (toolVars) {
						varGroups[0].variables.push(...toolVars.map(toolsetVariableToVariable))
					}
				}
			}
		}

		graph?.nodes?.filter((_) => _.type === 'agent' && _.key !== nodeKey)
			.forEach((node) => {
				const g = getAgentVarGroup(node.key, graph)
				varGroups.push(g)
			})

		// if (type === 'workflow' && graph) {
		// 	uniq(graph.connections.filter((con) => con.type === 'edge' && con.to === nodeKey && isAgentKey(con.from))
		// 		.map((con) => con.from))
		// 		.forEach((agentKey) => {
		// 			const g = getAgentVarGroup(agentKey, graph)
		// 			varGroups.push(g)
		// 		})
		// }

		return varGroups
	}

}

function xpertParameterToVariable(parameter: TXpertParameter) {
	return parameter as TStateVariable
}
function toolsetVariableToVariable(variable: TStateVariable) {
	return omit(variable, 'reducer', 'default') as TStateVariable
}
