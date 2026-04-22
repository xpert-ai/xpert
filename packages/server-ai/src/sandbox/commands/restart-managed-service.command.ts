import { ISandboxManagedService } from '@xpert-ai/contracts'
import { Command } from '@nestjs/cqrs'

export class SandboxRestartManagedServiceCommand extends Command<ISandboxManagedService> {
    static readonly type = '[Sandbox] Restart Managed Service'

    constructor(
        public readonly params: {
            serviceId: string
            threadId: string
        }
    ) {
        super()
    }
}
