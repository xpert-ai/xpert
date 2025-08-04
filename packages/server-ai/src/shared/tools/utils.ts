import { zodToJsonSchema } from 'zod-to-json-schema'
import { z } from 'zod'
import { IWFNAgentTool, TVariableAssigner, TXpertGraph } from '@metad/contracts'
import { StructuredToolInterface, tool } from '@langchain/core/tools'
import { RunnableToolLike } from '@langchain/core/runnables'
import { createParameters } from '../agent/parameter'
type ZodObjectAny = z.ZodObject<any, any, any, any>


export class ToolSchemaParser {
	static parseZodToJsonSchema(schema: ZodObjectAny | z.ZodEffects<ZodObjectAny>) {
		const jsonSchema = zodToJsonSchema(schema)
		return jsonSchema
	}

	static serializeJsonSchema(schema) {
		return JSON.stringify(schema, null, 2)
	}
}

export function toolNamePrefix(prefix: string, name: string) {
	return `${prefix ? prefix + '__' : ''}${name}`
}


export type TGraphTool = {
	caller: string
	toolset: {
		provider: string
		title: string
		id?: string
	}
	tool: StructuredToolInterface | RunnableToolLike
	variables?: TVariableAssigner[]
}

export function createWorkflowAgentTools(agentKey: string, graph: TXpertGraph) {
	const tools: TGraphTool[] = []
	const endNodes: string[] = []
	const node = graph.nodes.find((n) => n.type === 'agent' && n.key === agentKey)

	const connections = graph.connections.filter((c) => c.from === node.key && c.type === 'workflow')
	graph.nodes.filter((_) => _.type === 'workflow' && connections.some((c) => c.to === _.key)).forEach((workflowNode) => {
		const entity = workflowNode.entity as IWFNAgentTool

		const zodSchema = z.object({
					...createParameters(entity.toolParameters),
				})

		tools.push({
			caller: agentKey,
			toolset: {
				provider: 'workflow_agent_tool',
				title: entity.toolName,
			},
			tool: tool(async () => {
				return 'Done!'
			}, {
				name: entity.toolName,
				description: entity.toolDescription,
				schema: zodSchema
			})
		})
		if (entity.isEnd) {
			endNodes.push(entity.toolName)
		}
	})
	return {tools, endNodes}
}