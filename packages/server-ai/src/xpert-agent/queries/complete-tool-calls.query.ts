import { PregelTaskDescription } from '@langchain/langgraph/dist/pregel/types'
import { IQuery } from '@nestjs/cqrs'
import { AgentStateAnnotation } from '../../shared'

/**
 * Derived detailed information for the tool calls of interrupted AI message by Xpert's agents and tools.
 * 
 * @return TSensitiveOperation
 */
export class CompleteToolCallsQuery implements IQuery {
	static readonly type = '[Xpert Agent] Complete tool calls'

	constructor(
		public readonly xpertId: string,
		public readonly tasks: PregelTaskDescription[],
		public readonly values: typeof AgentStateAnnotation.State,
		public readonly isDraft?: boolean,
	) {}
}
