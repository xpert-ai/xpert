import { IXpertAgent, TWorkflowVarGroup, TXpertGraph } from '@metad/contracts'
import { CommandBus, IQueryHandler, QueryHandler } from '@nestjs/cqrs'
import { BaseToolset, ToolsetGetToolsCommand } from '../../../xpert-toolset'
import { XpertService } from '../../../xpert/xpert.service'
import { XpertAgentVariableSchemaQuery } from '../get-variable-schema.query'

@QueryHandler(XpertAgentVariableSchemaQuery)
export class XpertAgentVariableSchemaHandler implements IQueryHandler<XpertAgentVariableSchemaQuery> {
	constructor(
		private readonly xpertService: XpertService,
		private readonly commandBus: CommandBus,
	) {}

	public async execute(command: XpertAgentVariableSchemaQuery): Promise<TWorkflowVarGroup[]> {
		const { xpertId, type, variable, isDraft } = command.options

		const _variables = variable.split('.')
		const variableName = _variables[1] || _variables[0]
		let variableSchema = null
		const xpert = await this.xpertService.findOne(xpertId, { select: ['agentConfig', 'draft', 'graph'] })

		const agentConfig = isDraft ? (xpert.draft?.team?.agentConfig ?? xpert.agentConfig) : xpert.agentConfig
		const stateVariables = agentConfig?.stateVariables
		if (stateVariables) {
			variableSchema = stateVariables.find((_) => _.name === variableName)
			if (variableSchema) {
				return variableSchema
			}
		}

		// All agents output
		const graph = isDraft ? ({ ...(xpert.graph ?? {}), ...(xpert.draft ?? {}) } as TXpertGraph) : xpert.graph

		const agentNodes = graph?.nodes?.filter((_) => _.type === 'agent')
		if (agentNodes) {
			for await (const node of agentNodes) {
				variableSchema = (<IXpertAgent>node.entity).outputVariables?.find((_) => _.name === variableName)
				if (variableSchema) {
					return variableSchema
				}

				const toolIds = (<IXpertAgent>node.entity).toolsetIds
				if (!toolIds) {
					continue
				}

				const toolsets = await this.commandBus.execute<ToolsetGetToolsCommand, BaseToolset[]>(
					new ToolsetGetToolsCommand(toolIds)
				)
	
				for await (const toolset of toolsets) {
					await toolset.initTools()
					const toolVars = toolset.getVariables()
					if (toolVars) {
						variableSchema = toolVars.find((_) => _.name === variableName)
						if (variableSchema) {
							return variableSchema
						}
					}
				}
			}
		}
	}
}
