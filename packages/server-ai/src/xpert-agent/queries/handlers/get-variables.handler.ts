import {
	channelName,
	IWFNCode,
	IWorkflowNode,
	IXpertAgent,
	STATE_VARIABLE_SYS,
	TStateVariable,
	TWorkflowVarGroup,
	TXpertGraph,
	TXpertParameter,
	WorkflowNodeTypeEnum,
	XpertParameterTypeEnum
} from '@metad/contracts'
import { omit } from '@metad/server-common'
import { CommandBus, IQueryHandler, QueryBus, QueryHandler } from '@nestjs/cqrs'
import { BaseToolset, ToolsetGetToolsCommand } from '../../../xpert-toolset'
import { GetXpertAgentQuery } from '../../../xpert/queries/'
import { XpertService } from '../../../xpert/xpert.service'
import { getAgentVarGroup } from '../../agent'
import { STATE_VARIABLE_INPUT } from '../../commands/handlers/types'
import { XpertAgentVariablesQuery } from '../get-variables.query'

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
						name: `${STATE_VARIABLE_SYS}.language`,
						type: XpertParameterTypeEnum.STRING,
						description: {
							en_US: 'Language',
							zh_Hans: '语言'
						}
					},
					{
						name: `${STATE_VARIABLE_SYS}.user_email`,
						type: XpertParameterTypeEnum.STRING,
						description: {
							en_US: 'User email',
							zh_Hans: '用户邮箱'
						}
					},
					{
						name: `${STATE_VARIABLE_SYS}.timezone`,
						type: XpertParameterTypeEnum.STRING,
						description: {
							en_US: 'User time zone',
							zh_Hans: '用户时区'
						}
					},
					{
						name: `${STATE_VARIABLE_SYS}.date`,
						type: XpertParameterTypeEnum.STRING,
						description: {
							en_US: 'Current Date',
							zh_Hans: '当前日期'
						}
					},
					{
						name: `${STATE_VARIABLE_SYS}.datetime`,
						type: XpertParameterTypeEnum.STRING,
						description: {
							en_US: 'Current Datetime',
							zh_Hans: '当前时间'
						}
					},
					{
						name: `${STATE_VARIABLE_SYS}.common_times`,
						type: XpertParameterTypeEnum.STRING,
						description: {
							en_US: 'Common Times',
							zh_Hans: '常用时间'
						}
					}
				]
			}
		]

		const agentConfig = isDraft ? (xpert.draft?.team?.agentConfig ?? xpert.agentConfig) : xpert.agentConfig
		const stateVariables = agentConfig?.stateVariables
		if (stateVariables) {
			varGroups[0].variables.push(...stateVariables)
		}

		// All agents output
		const graph = isDraft ? ({ ...(xpert.graph ?? {}), ...(xpert.draft ?? {}) } as TXpertGraph) : xpert.graph

		if (type === 'agent') {
			if (nodeKey) {
				const variables = await this.getAgentVariables(xpertId, nodeKey, isDraft)
				varGroups[0].variables.push(...variables)
			}
		}

		const agentNodes = graph?.nodes?.filter((_) => _.type === 'agent' && _.key !== nodeKey)
		if (agentNodes) {
			for await (const node of agentNodes) {
				const g = getAgentVarGroup(node.key, graph)
				varGroups.push(g)

				const agent = await this.queryBus.execute<GetXpertAgentQuery, IXpertAgent>(
					new GetXpertAgentQuery(xpertId, node.key, isDraft)
				)
				const toolsets = await this.commandBus.execute<ToolsetGetToolsCommand, BaseToolset[]>(
					new ToolsetGetToolsCommand(agent.toolsetIds)
				)
				for await (const toolset of toolsets) {
					const toolVars = await toolset.getVariables()
					if (toolVars) {
						varGroups[0].variables.push(...toolVars.map(toolsetVariableToVariable))
					}
				}
			}
		}

		const workflowNodes = graph?.nodes?.filter((_) => _.type === 'workflow' && _.key !== nodeKey)
		if (workflowNodes) {
			for await (const node of workflowNodes) {
				const entity = node.entity as IWorkflowNode
				if (entity.type === WorkflowNodeTypeEnum.CODE) {
					const variables: TXpertParameter[] = []
					const varGroup: TWorkflowVarGroup = {
						group: {
							name: channelName(entity.key),
							description: entity.title || {
								en_US: entity.key,
							},
						},
						variables
					}
					varGroups.push(varGroup);
					variables.push(...((<IWFNCode>entity).outputs ?? []))
					variables.push({
						type: XpertParameterTypeEnum.STRING,
  						name: 'error',
						title: 'Error',
						description: {
							en_US: 'Error info',
							zh_Hans: '错误信息'
						}
					})
				}
			}
		}
		return varGroups
	}

	async getAgentVariables(xpertId: string, key: string, isDraft: boolean) {
		const variables = []
		const agent = await this.queryBus.execute<GetXpertAgentQuery, IXpertAgent>(
			new GetXpertAgentQuery(xpertId, key, isDraft)
		)
		if (!agent) {
			return variables
		}

		const toolsets = await this.commandBus.execute<ToolsetGetToolsCommand, BaseToolset[]>(
			new ToolsetGetToolsCommand(agent.toolsetIds)
		)

		if (agent.parameters) {
			variables.push(...agent.parameters.map(xpertParameterToVariable))
		}

		for await (const toolset of toolsets) {
			const toolVars = await toolset.getVariables()
			if (toolVars) {
				variables.push(...toolVars.map(toolsetVariableToVariable))
			}
		}

		return variables
	}
}

function xpertParameterToVariable(parameter: TXpertParameter) {
	return parameter as TStateVariable
}
function toolsetVariableToVariable(variable: TStateVariable) {
	return omit(variable, 'reducer', 'default') as TStateVariable
}
