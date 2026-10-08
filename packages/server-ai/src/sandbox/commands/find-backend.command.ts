import { TSandboxConfigurable } from '@xpert-ai/contracts'
import { Command } from '@nestjs/cqrs'
import { SandboxAcquireBackendCommand } from './acquire-backend.command'

/** Inspect a cached backend without creating or recovering a runtime. */
export class SandboxFindBackendCommand extends Command<TSandboxConfigurable | null> {
    constructor(public readonly params: SandboxAcquireBackendCommand['params']) {
        super()
    }
}
