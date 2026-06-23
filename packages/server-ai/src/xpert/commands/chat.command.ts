import { IXpertAgentExecution, TChatOptions, TChatRequest, TChatSourceAuditOptions } from '@xpert-ai/contracts'
import { Command } from '@nestjs/cqrs'
import { Observable } from 'rxjs'

export interface XpertChatStreamPersistenceOptions {
    transport: 'redis-stream'
    threadId?: string | null
    runId?: string | null
}

export class XpertChatCommand extends Command<Observable<MessageEvent>> {
    static readonly type = '[Xpert] Chat'

    constructor(
        public readonly request: TChatRequest,
        public readonly options?: TChatOptions &
            TChatSourceAuditOptions & {
                xpertId?: string
                // Use xpert's draft
                isDraft?: boolean
                fromEndUserId?: string
                execution?: { id: string; metadata?: IXpertAgentExecution['metadata'] }
                streamPersistence?: XpertChatStreamPersistenceOptions
            }
    ) {
        super()
    }
}
