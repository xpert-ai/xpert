import { Command } from '@nestjs/cqrs'
import type { TSandboxConfigurable } from '@xpert-ai/contracts'

export type SandboxCopyTreeStatus = 'skipped' | 'success'

export type SandboxCopyTreeSandboxParams = TSandboxConfigurable | null

export type SandboxCopyTreeParams = {
    version: string | number
    localPath: string
    containerPath: string
    overwrite?: boolean
}

export type SandboxCopyTreeMode = 'local' | 'upload'

export class SandboxCopyTreeCommand extends Command<{
    containerId: string
    localPath?: string
    containerPath: string
    status: SandboxCopyTreeStatus
    version: string | number
    fileCount?: number
    totalBytes?: number
    scanMs?: number
    uploadMs?: number
    totalMs?: number
    mode?: SandboxCopyTreeMode
    reason?: string
}> {
    constructor(
        public readonly sandbox: SandboxCopyTreeSandboxParams,
        public readonly copyTree: SandboxCopyTreeParams
    ) {
        super()
    }
}
