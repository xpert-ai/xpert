import { TSandboxConfigurable } from '@xpert-ai/contracts'
import { Command } from '@nestjs/cqrs'
import { SandboxProviderCreateOptions } from '@xpert-ai/plugin-sdk'
import { VolumeScope } from '../../shared'

export class SandboxAcquireBackendCommand extends Command<TSandboxConfigurable> {
    static readonly type = '[Sandbox] Acquire Backend'

    constructor(
        public readonly params: {
            provider?: string | null
            workingDirectory?: string
            workspaceBinding?: SandboxProviderCreateOptions['workspaceBinding']
            volumeScope?: VolumeScope
            environmentId?: string
            tenantId?: string
            organizationId?: string | null
            workFor: SandboxProviderCreateOptions['workFor']
        }
    ) {
        super()
    }
}
