import { BaseStore, SearchItem } from '@langchain/langgraph-checkpoint'
import { IXpert, IXpertAgentExecution, STATE_VARIABLE_HUMAN, TChatOptions, TChatRequestHuman, TInterruptCommand} from '@metad/contracts'
import { ICommand } from '@nestjs/cqrs'
import { Subscriber } from 'rxjs'

export class XpertAgentInvokeCommand implements ICommand {
	static readonly type = '[Xpert Agent] Invoke'

	constructor(
		public readonly state: {
			[STATE_VARIABLE_HUMAN]: TChatRequestHuman
			[key: string]: any
		},
		public readonly agentKeyOrName: string,
		public readonly xpert: Partial<IXpert>,
		public readonly options: TChatOptions & {
			// Langgraph thread id
			thread_id?: string
			// Use xpert's draft
			isDraft: boolean
			/**
			 * The id of root agent execution
			 * @deprecated use `executionId` in `TAgentRunnableConfigurable`
			 */
			rootExecutionId: string
			/**
			 * The instance of current agent execution.
			 * Do't save execution in ExecuteCommand, only update it's attributes
			 */
			execution: IXpertAgentExecution
			// The subscriber response to client
			subscriber: Subscriber<MessageEvent>
			/**
			 * Long-term memory store
			 */
			store: BaseStore
			/**
			 * Abort controller from parent context
			 */
			abortController?: AbortController

			command?: TInterruptCommand
			reject?: boolean

			/**
			 * Memory
			 */
			memories?: SearchItem[]
		}
	) {}
}
