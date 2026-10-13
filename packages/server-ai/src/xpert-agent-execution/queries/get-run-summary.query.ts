import { Query } from '@nestjs/cqrs'
import type { IXpert, IXpertAgentExecution } from '@xpert-ai/contracts'

export type TAgentExecutionRunSummary = Pick<
    IXpertAgentExecution,
    | 'id'
    | 'threadId'
    | 'parentId'
    | 'xpertId'
    | 'type'
    | 'category'
    | 'agentKey'
    | 'title'
    | 'status'
    | 'error'
    | 'elapsedTime'
    | 'inputs'
    | 'metadata'
    | 'createdAt'
    | 'updatedAt'
> & { xpert?: Pick<IXpert, 'avatar'> }

/** Read persisted run fields; callers retain conversation and thread ownership checks. */
export class GetAgentExecutionRunSummaryQuery extends Query<TAgentExecutionRunSummary> {
    static readonly type = '[Xpert Agent Execution] Get run summary'

    constructor(public readonly id: string) {
        super()
    }
}
