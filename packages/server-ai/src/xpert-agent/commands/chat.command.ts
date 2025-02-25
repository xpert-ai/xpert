import { SearchItem } from '@langchain/langgraph-checkpoint'
import { IXpert, IXpertAgentExecution, TChatOptions, TSensitiveOperation } from '@metad/contracts'
import { ICommand } from '@nestjs/cqrs'

/**
 * Chat with one xpert agent
 */
export class XpertAgentChatCommand implements ICommand {
	static readonly type = '[Xpert Agent] Chat'

	constructor(
		public readonly input: {
			input?: string
			[key: string]: unknown
		},
		public readonly agentKey: string,
		public readonly xpert: IXpert,
		public readonly options: TChatOptions & {
			// Use xpert's draft
			isDraft?: boolean
			/**
			 * Use this execution or create a new record
			 */
			execution?: IXpertAgentExecution

			operation?: TSensitiveOperation
			reject?: boolean

			memories?: SearchItem[]
		}
	) {}
}
