import { ToolCall } from '@langchain/core/dist/messages/tool'
import { SearchItem } from '@langchain/langgraph-checkpoint'
import { IXpert, IXpertAgentExecution, TChatOptions } from '@metad/contracts'
import { ICommand } from '@nestjs/cqrs'
import { Subscriber } from 'rxjs'


/**
 * @deprecated use XpertAgentSubgraphCommand
 */
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
			memories?: SearchItem[]
		}
	) {}
}
