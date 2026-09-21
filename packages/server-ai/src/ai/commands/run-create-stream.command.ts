import { IXpertAgentExecution } from '@xpert-ai/contracts'
import { Command } from '@nestjs/cqrs'
import { Observable } from 'rxjs'
import type { components } from '../schemas/agent-protocol-schema'

export type RunCreateStreamTransport = 'redis' | 'direct'
export type RunCreateStreamInput = Omit<components['schemas']['RunCreateStateful'], 'input'> & { input?: unknown }

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
        public readonly runCreate: RunCreateStreamInput,
        public readonly resumePaused?: { executionId: string; pauseId: string }
    ) {
        super()
    }
}
