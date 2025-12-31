import { PregelTaskDescription } from '@langchain/langgraph/dist/pregel/types'
import { Query } from '@nestjs/cqrs'
import { AgentStateAnnotation } from '../../shared'
import { TSensitiveOperation } from '@metad/contracts'

/**
 * Derived detailed information for the tool calls of interrupted AI message by Xpert's agents and tools.
 * 
 * @return TSensitiveOperation
 * @deprecated Replace with a better method
 */
export class CompleteToolCallsQuery extends Query<TSensitiveOperation> {
	static readonly type = '[Xpert Agent] Complete tool calls'

	constructor(
		public readonly xpertId: string,
		public readonly tasks: PregelTaskDescription[],
		public readonly values: typeof AgentStateAnnotation.State,
		public readonly isDraft?: boolean,
	) {
		super()
	}
}
