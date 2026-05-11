import { IXpertAgentExecution } from '@xpert-ai/contracts'
import { Command } from '@nestjs/cqrs'
import { Observable } from 'rxjs'
import type { components } from '../schemas/agent-protocol-schema'

export type RunCreateStreamTransport = 'redis' | 'direct'

export interface RunCreateStreamResult {
    execution: IXpertAgentExecution
    stream: Observable<MessageEvent>
    streamTransport?: RunCreateStreamTransport
}

/**
 */
export class RunCreateStreamCommand extends Command<RunCreateStreamResult> {
    static readonly type = '[Agent Protocol] Create run stream'

    constructor(
        public readonly threadId: string,
        public readonly runCreate: components['schemas']['RunCreateStateful']
    ) {
        super()
    }
}
