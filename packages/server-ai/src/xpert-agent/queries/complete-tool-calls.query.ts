import { PregelTaskDescription } from '@langchain/langgraph/dist/pregel/types'
import { Query } from '@nestjs/cqrs'
import { TSensitiveOperation } from '@xpert-ai/contracts'
import type { Checkpoint } from '@langchain/langgraph-checkpoint'

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
        public readonly values: object,
        public readonly isDraft?: boolean,
        public readonly projectId?: string,
        public readonly checkpoint?: Pick<Checkpoint, 'channel_values'>
    ) {
        super()
    }
}
