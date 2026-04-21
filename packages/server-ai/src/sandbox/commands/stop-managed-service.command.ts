import { ISandboxManagedService } from '@xpert-ai/contracts'
import { Command } from '@nestjs/cqrs'

export class SandboxStopManagedServiceCommand extends Command<ISandboxManagedService> {
    static readonly type = '[Sandbox] Stop Managed Service'

    constructor(
        public readonly params: {
            serviceId: string
            threadId: string
        }
    ) {
        super()
    }
}
