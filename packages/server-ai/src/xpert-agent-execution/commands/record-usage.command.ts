import { ICommand } from '@nestjs/cqrs'
import type { TExecutionUsageRecord } from '../types'

export class XpertAgentExecutionRecordUsageCommand implements ICommand {
    static readonly type = '[Xpert Agent Execution] Record usage'

    constructor(
        public readonly executionId: string,
        public readonly usage: TExecutionUsageRecord
    ) {}
}
