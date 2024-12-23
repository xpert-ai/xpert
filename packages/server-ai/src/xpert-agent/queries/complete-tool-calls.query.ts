import { AIMessage } from '@langchain/core/messages'
import { IQuery } from '@nestjs/cqrs'

/**
 * Derived detailed information for the tool calls of interrupted AI message by Xpert's agents and tools.
 * 
 * @return TSensitiveOperation
 */
export class CompleteToolCallsQuery implements IQuery {
	static readonly type = '[Xpert] Complete tool calls'

	constructor(
		public readonly xpertId: string,
		public readonly agentKey: string,
		public readonly aiMessage?: AIMessage,
		public readonly isDraft?: boolean,
	) {}
}
