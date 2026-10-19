import { Command } from '@nestjs/cqrs'
import type { ProjectPipelineInvocationScope } from '@xpert-ai/plugin-sdk'

/** Reauthorize a saved Pipeline operation before resolving or controlling its exact Runtime binding. */
export class AuthorizeProjectPipelineRuntimeCommand extends Command<void> {
    constructor(
        readonly scope: ProjectPipelineInvocationScope,
        readonly bindingId: string,
        readonly phase: 'resolve' | 'dispatch' = 'resolve'
    ) {
        super()
    }
}
