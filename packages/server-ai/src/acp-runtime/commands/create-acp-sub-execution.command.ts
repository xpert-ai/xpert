import { TAcpCodeContext, TAcpPermissionProfile, TAcpSessionMode, THarnessType } from '@xpert-ai/contracts'
import { Command } from '@nestjs/cqrs'

export type CreateAcpSubExecutionInput = {
  title: string
  prompt: string
  harnessType?: THarnessType
  targetRef?: string | null
  mode?: TAcpSessionMode
  reuseSession?: boolean
  permissionProfile?: TAcpPermissionProfile
  timeoutMs?: number
  targetPaths?: string[]
  codeContext?: TAcpCodeContext | null
  parentExecutionId: string
  threadId?: string
  xpertId?: string
  conversationId?: string
  environmentId?: string
  sandboxEnvironmentId?: string | null
  sandboxProvider?: string | null
  sandboxWorkForType: 'environment' | 'project' | 'user'
  sandboxWorkForId: string
  workingDirectory: string
}

export type CreateAcpSubExecutionResult = {
  executionId: string
  acpSessionId: string
  status: string
  message: string
}

export class CreateAcpSubExecutionCommand extends Command<CreateAcpSubExecutionResult> {
  static readonly type = '[ACP Runtime] Create ACP Sub Execution'

  constructor(public readonly input: CreateAcpSubExecutionInput) {
    super()
  }
}
