import { Command } from '@nestjs/cqrs'
import type { TSandboxConfigurable } from '@xpert-ai/contracts'

export type SandboxCopyFileStatus = 'skipped' | 'success'

export type SandboxCopyFileSandboxParams = TSandboxConfigurable | null

export type SandboxCopyFileParams = {
  version: string | number // Used to determine whether an update is needed.
  localPath: string
  containerPath: string // e.g. /root/workspace/uploads/
  overwrite?: boolean   // optional
}

/**
 * Command to copy a file from the local filesystem to a sandbox container.
 */
export class SandboxCopyFileCommand extends Command<{
      containerId: string
      localPath?: string,
      containerPath: string,
      status: SandboxCopyFileStatus
      version: string | number
      reason?: string
}> {
  constructor(
    public readonly sandbox: SandboxCopyFileSandboxParams,
    public readonly copyFile: SandboxCopyFileParams
  ) {
    super()
  }
}
