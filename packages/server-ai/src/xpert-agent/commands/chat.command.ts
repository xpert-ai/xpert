import { BaseStore, SearchItem } from '@langchain/langgraph-checkpoint'
import { IXpert, IXpertAgentExecution, STATE_VARIABLE_HUMAN, TChatOptions, TChatRequestHuman, TInterruptCommand } from '@metad/contracts'
import { ICommand } from '@nestjs/cqrs'

/**
 * Chat with one xpert agent
 */
export class XpertAgentChatCommand implements ICommand {
	static readonly type = '[Xpert Agent] Chat'

	constructor(
		public readonly state: {
					[STATE_VARIABLE_HUMAN]: TChatRequestHuman
					[key: string]: any
				},
		public readonly agentKey: string,
		public readonly xpert: IXpert,
		public readonly options: TChatOptions & {
			// Use xpert's draft
			isDraft: boolean
			/**
			 * Long-term memory store
			 */
			store: BaseStore
			/**
			 * Use this execution or create a new record
			 */
			execution?: IXpertAgentExecution

			command?: TInterruptCommand
			reject?: boolean

			memories?: SearchItem[]
		}
	) {}
}
