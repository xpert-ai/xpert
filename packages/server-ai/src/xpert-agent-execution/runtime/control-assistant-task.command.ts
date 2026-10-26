import { Command } from '@nestjs/cqrs'
import type { AgentRuntimeObservation } from '@xpert-ai/plugin-sdk'

/** Inspect/control the original native task under the current actor's resource authorization. */
export class ControlAssistantTaskCommand extends Command<AgentRuntimeObservation> {
    constructor(
        readonly executionId: string,
        readonly action: 'inspect' | 'cancel'
    ) {
        super()
    }
}
