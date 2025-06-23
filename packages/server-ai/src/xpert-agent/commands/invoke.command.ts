import { SearchItem } from '@langchain/langgraph-checkpoint'
import { IStorageFile, IXpert, IXpertAgentExecution, TChatOptions, TSensitiveOperation} from '@metad/contracts'
import { ICommand } from '@nestjs/cqrs'
import { Subscriber } from 'rxjs'

export class XpertAgentInvokeCommand implements ICommand {
	static readonly type = '[Xpert Agent] Invoke'

	constructor(
		public readonly input: {
			input?: string
			files?: IStorageFile[]
			[key: string]: unknown
		},
		public readonly agentKeyOrName: string,
		public readonly xpert: Partial<IXpert>,
		public readonly options: TChatOptions & {
			// Langgraph thread id
			thread_id?: string
			// Use xpert's draft
			isDraft?: boolean
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
			
			operation?: TSensitiveOperation
			reject?: boolean

			/**
			 * Memory
			 */
			memories?: SearchItem[]
		}
	) {}
}
