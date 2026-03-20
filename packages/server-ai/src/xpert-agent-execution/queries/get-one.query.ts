import { PaginationParams } from '@metad/server-core'
import { Query } from '@nestjs/cqrs'
import { XpertAgentExecution } from '../agent-execution.entity'
import { IXpertAgentExecution } from '@metad/contracts'

export class XpertAgentExecutionOneQuery extends Query<IXpertAgentExecution> {
    static readonly type = '[Xpert Agent Execution] Get one'

    constructor(
        public readonly id: string,
        public readonly paginationParams?: Partial<PaginationParams<XpertAgentExecution>>
    ) {
        super()
    }
}
