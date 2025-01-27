import { agentLabel, IXpertAgent, TStateVariable, TXpertParameter } from '@metad/contracts'
import { CommandBus, IQueryHandler, QueryBus, QueryHandler } from '@nestjs/cqrs'
import { omit } from 'lodash'
import { BaseToolset, ToolsetGetToolsCommand } from '../../../xpert-toolset'
import { GetXpertAgentQuery } from '../../../xpert/queries/'
import {
	STATE_VARIABLE_SYS_LANGUAGE,
	STATE_VARIABLE_USER_EMAIL,
	STATE_VARIABLE_USER_TIMEZONE
} from '../../commands/handlers/types'
import { XpertAgentVariablesQuery } from '../get-variables.query'
import { XpertService } from '../../../xpert/xpert.service'

@QueryHandler(XpertAgentVariablesQuery)
export class XpertAgentVariablesHandler implements IQueryHandler<XpertAgentVariablesQuery> {
	constructor(
		private readonly xpertService: XpertService,
		private readonly commandBus: CommandBus,
		private readonly queryBus: QueryBus
	) {}

	public async execute(command: XpertAgentVariablesQuery): Promise<any[]> {
		const { xpertId, agentKey, isDraft } = command

		const xpert = await this.xpertService.findOne(xpertId, {select: ['agentConfig', 'draft', 'graph']})

		const variables: TStateVariable[] = [
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

		const agent = await this.queryBus.execute<GetXpertAgentQuery, IXpertAgent>(
			new GetXpertAgentQuery(xpertId, agentKey, isDraft)
		)
		if (!agent) {
			return variables
		}

		if (xpert.agentConfig?.stateVariables) {
			variables.push(...xpert.agentConfig.stateVariables)
		}

		if (agentKey) {
			const toolsets = await this.commandBus.execute<ToolsetGetToolsCommand, BaseToolset[]>(
				new ToolsetGetToolsCommand(agent.toolsetIds)
			)

			if (agentKey && agent.parameters) {
				variables.push(...agent.parameters.map(xpertParameterToVariable))
			}

			for await (const toolset of toolsets) {
				await toolset.initTools()
				const toolVars = toolset.getVariables()
				if (toolVars) {
					variables.push(...toolVars.map(toolsetVariableToVariable))
				}
			}
		}

		// All agents output
		const graph = isDraft ? xpert.draft : xpert.graph
		graph.nodes.filter((_) => _.type === 'agent' && _.key !== agentKey).forEach((_) => {
			variables.push({
				name: `${_.key}.output`,
				type: 'string',
				description: {
					zh_Hans: `${agentLabel(_.entity as IXpertAgent)} 输出`,
					en_US: `${agentLabel(_.entity as IXpertAgent)} Output`
				},
			})
		})

		return variables
	}
}

function xpertParameterToVariable(parameter: TXpertParameter) {
	return parameter as TStateVariable
}
function toolsetVariableToVariable(variable: TStateVariable) {
	return omit(variable, 'reducer', 'default') as TStateVariable
}
