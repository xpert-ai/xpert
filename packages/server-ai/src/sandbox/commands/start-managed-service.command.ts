import { ISandboxManagedService, TSandboxManagedServiceStartInput } from '@xpert-ai/contracts'
import { Command } from '@nestjs/cqrs'

export class SandboxStartManagedServiceCommand extends Command<ISandboxManagedService> {
    static readonly type = '[Sandbox] Start Managed Service'

    constructor(
        public readonly params: {
            agentKey?: string | null
            executionId?: string | null
            input: TSandboxManagedServiceStartInput
            threadId: string
        }
    ) {
        super()
    }
}
