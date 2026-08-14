import { ICommand } from '@nestjs/cqrs'
import type { TModelUsageType } from '@xpert-ai/plugin-sdk'

export class XpertAgentExecutionAddTokensCommand implements ICommand {
    static readonly type = '[Xpert Agent Execution] Add tokens'

    constructor(
        public readonly executionId: string,
        public readonly tokens: number,
        public readonly usageType?: TModelUsageType
    ) {}
}
