import { IXpertAgent, TStateVariable, TXpertParameter } from '@metad/contracts'
import { CommandBus, IQueryHandler, QueryBus, QueryHandler } from '@nestjs/cqrs'
import { omit } from 'lodash'
import { BaseToolset, ToolsetGetToolsCommand } from '../../../xpert-toolset'
import { GetXpertAgentQuery } from '../../../xpert/queries/'
import { XpertAgentVariablesQuery } from '../get-variables.query'

@QueryHandler(XpertAgentVariablesQuery)
export class XpertAgentVariablesHandler implements IQueryHandler<XpertAgentVariablesQuery> {
	constructor(
		private readonly commandBus: CommandBus,
		private readonly queryBus: QueryBus
	) {}

	public async execute(command: XpertAgentVariablesQuery): Promise<any[]> {
		const { xpertId, agentKey, isDraft } = command

		const variables: TStateVariable[] = []

		const agent = await this.queryBus.execute<GetXpertAgentQuery, IXpertAgent>(
			new GetXpertAgentQuery(xpertId, agentKey, isDraft)
		)
		const toolsets = await this.commandBus.execute<ToolsetGetToolsCommand, BaseToolset[]>(
			new ToolsetGetToolsCommand(agent.toolsetIds)
		)
		const xpert = agent.team
		if (xpert.agentConfig?.stateVariables) {
			variables.push(...xpert.agentConfig.stateVariables)
		}
		if (agent.parameters) {
			variables.push(...agent.parameters.map(xpertParameterToVariable))
		}

		for await (const toolset of toolsets) {
			const items = await toolset.initTools()
			variables.push(...toolset.getVariables().map(toolsetVariableToVariable))
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
