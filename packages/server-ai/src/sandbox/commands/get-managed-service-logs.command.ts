import { TSandboxManagedServiceLogs } from '@xpert-ai/contracts'
import { Command } from '@nestjs/cqrs'

export class SandboxGetManagedServiceLogsCommand extends Command<TSandboxManagedServiceLogs> {
    static readonly type = '[Sandbox] Get Managed Service Logs'

    constructor(
        public readonly params: {
            serviceId: string
            tail?: number
            threadId: string
        }
    ) {
        super()
    }
}
