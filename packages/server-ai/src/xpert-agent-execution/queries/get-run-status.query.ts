import { Query } from '@nestjs/cqrs'
import type { IXpertAgentExecution, TAgentExecutionMetadata } from '@xpert-ai/contracts'

export type AgentExecutionRunStatus = Pick<
    IXpertAgentExecution,
    'id' | 'threadId' | 'xpertId' | 'status' | 'error' | 'elapsedTime' | 'createdAt' | 'updatedAt' | 'completedAt'
> & { businessOutcome?: TAgentExecutionMetadata['businessOutcome'] }

/** Poll lifecycle facts without loading messages, inputs, outputs or Assistant presentation. */
export class GetAgentExecutionRunStatusQuery extends Query<AgentExecutionRunStatus> {
    constructor(public readonly id: string) {
        super()
    }
}
