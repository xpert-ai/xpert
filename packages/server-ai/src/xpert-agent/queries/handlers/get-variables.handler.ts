import {
	channelName,
	IXpertAgent,
	TStateVariable,
	TWorkflowVarGroup,
	TXpertParameter,
	TXpertTeamNode
} from '@metad/contracts'
import { pick } from '@metad/server-common'
import { CommandBus, IQueryHandler, QueryBus, QueryHandler } from '@nestjs/cqrs'
import { omit } from 'lodash'
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

@QueryHandler(XpertAgentVariablesQuery)
export class XpertAgentVariablesHandler implements IQueryHandler<XpertAgentVariablesQuery> {
	constructor(
		private readonly xpertService: XpertService,
		private readonly commandBus: CommandBus,
		private readonly queryBus: QueryBus
	) {}

	public async execute(command: XpertAgentVariablesQuery): Promise<TWorkflowVarGroup[]> {
		const { xpertId, agentKey, isDraft } = command

		const xpert = await this.xpertService.findOne(xpertId, { select: ['agentConfig', 'draft', 'graph'] })

		const varGroups: TWorkflowVarGroup[] = [
			{
				variables: [
					{
						name: STATE_VARIABLE_INPUT,
						type: 'string',
						description: {
							en_US: 'Input',
							zh_Hans: '输入'
						}
					},
					{
						name: STATE_VARIABLE_SYS_LANGUAGE,
						type: 'string',
						description: {
							en_US: 'Language',
							zh_Hans: '语言'
						}
					},
					{
						name: STATE_VARIABLE_USER_EMAIL,
						type: 'string',
						description: {
							en_US: 'User email',
							zh_Hans: '用户邮箱'
						}
					},
					{
						name: STATE_VARIABLE_USER_TIMEZONE,
						type: 'string',
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
		const graph = isDraft ? {...(xpert.graph ?? {}), ...(xpert.draft ?? {})} : xpert.graph
		const agents = graph?.nodes?.filter((_) => _.type === 'agent' && _.key !== agentKey) as Array<
			TXpertTeamNode & { type: 'agent' }
		>
		agents?.forEach((_) => {
			const variables = []
			varGroups.push({
				agent: {...pick(_.entity, 'name', 'title', 'description'), key: channelName(_.key)},
				variables
			})
			variables.push({
				name: `output`,
				type: 'string',
				description: {
					zh_Hans: `输出`,
					en_US: `Output`
				}
			})
			if ((<IXpertAgent>_.entity).outputVariables) {
				;(<IXpertAgent>_.entity).outputVariables.forEach((variable) => {
					variables.push({
						name: variable.name,
						type: variable.type as TStateVariable['type'],
						description: variable.description
					})
				})
			}
		})

		const agent = await this.queryBus.execute<GetXpertAgentQuery, IXpertAgent>(
			new GetXpertAgentQuery(xpertId, agentKey, isDraft)
		)
		if (!agent) {
			return varGroups
		}

		if (agentKey) {
			const toolsets = await this.commandBus.execute<ToolsetGetToolsCommand, BaseToolset[]>(
				new ToolsetGetToolsCommand(agent.toolsetIds)
			)

			if (agentKey && agent.parameters) {
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

		return varGroups
	}
}

function xpertParameterToVariable(parameter: TXpertParameter) {
	return parameter as TStateVariable
}
function toolsetVariableToVariable(variable: TStateVariable) {
	return omit(variable, 'reducer', 'default') as TStateVariable
}
