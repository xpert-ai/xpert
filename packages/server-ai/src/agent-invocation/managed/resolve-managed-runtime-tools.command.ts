import { Command } from '@nestjs/cqrs'
import type { AgentInvocationScope } from '@xpert-ai/plugin-sdk'

export interface ManagedRuntimeTools {
    tools: Array<{ id: string; version: string }>
    modelSourceId: string
}

/** Read-only admission preflight; inherits current Computer and model access without issuing credentials. */
export class ResolveManagedRuntimeToolsCommand extends Command<ManagedRuntimeTools> {
    constructor(readonly scope: Readonly<AgentInvocationScope>) {
        super()
    }
}
