import { ISandboxManagedService } from '@xpert-ai/contracts'
import { Command } from '@nestjs/cqrs'

export class SandboxListManagedServicesCommand extends Command<ISandboxManagedService[]> {
    static readonly type = '[Sandbox] List Managed Services'

    constructor(public readonly params: { threadId: string }) {
        super()
    }
}
