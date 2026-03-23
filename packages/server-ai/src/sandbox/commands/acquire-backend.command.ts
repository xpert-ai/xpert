import { TSandboxConfigurable } from '@metad/contracts'
import { Command } from '@nestjs/cqrs'
import { SandboxProviderCreateOptions } from '@xpert-ai/plugin-sdk'

export class SandboxAcquireBackendCommand extends Command<TSandboxConfigurable> {
    static readonly type = '[Sandbox] Acquire Backend'

    constructor(
        public readonly params: {
            provider?: string | null
            workingDirectory?: string
            tenantId?: string
            workFor: SandboxProviderCreateOptions['workFor']
        }
    ) {
        super()
    }
}
