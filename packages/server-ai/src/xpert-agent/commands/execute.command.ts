import { ToolCall } from '@langchain/core/dist/messages/tool'
import { SearchItem } from '@langchain/langgraph-checkpoint'
import { IXpert, IXpertAgentExecution, TChatOptions, TXpertParameter, XpertParameterTypeEnum } from '@metad/contracts'
import { ICommand } from '@nestjs/cqrs'
import { Subscriber } from 'rxjs'
import { z } from 'zod'

export class XpertAgentExecuteCommand implements ICommand {
	static readonly type = '[Xpert Agent] Execute'

	constructor(
		public readonly input: {
			input?: string
			[key: string]: unknown
		},
		public readonly agentKey: string,
		public readonly xpert: Partial<IXpert>,
		public readonly options: TChatOptions & {
			// The id of root agent execution
			rootExecutionId: string
			// Langgraph thread id
			thread_id?: string
			// Use xpert's draft
			isDraft?: boolean
			/**
			 * The instance of current agent execution.
			 * Do't save execution in ExecuteCommand, only update it's attributes
			 */
			execution: IXpertAgentExecution
			// The subscriber response to client
			subscriber: Subscriber<MessageEvent>

			toolCalls?: ToolCall[]
			reject?: boolean

			/**
			 * Memory
			 */
			memory?: SearchItem[]
		}
	) {}
}

/**
 * Create zod schema for custom parameters of agent
 *
 * @param parameters
 * @returns
 */
export function createParameters(parameters: TXpertParameter[]) {
	return parameters?.reduce((schema, parameter) => {
		let value = null
		switch (parameter.type) {
			case XpertParameterTypeEnum.TEXT:
			case XpertParameterTypeEnum.PARAGRAPH: {
				value = z.string()
				break
			}
			case XpertParameterTypeEnum.NUMBER: {
				value = z.number()
				break
			}
			case XpertParameterTypeEnum.SELECT: {
				value = z.enum(parameter.options as any)
			}
		}

		if (value) {
			if (parameter.optional) {
				schema[parameter.name] = value.optional().describe(parameter.description)
			} else {
				schema[parameter.name] = value.describe(parameter.description)
			}
		}

		return schema
	}, {})
}
