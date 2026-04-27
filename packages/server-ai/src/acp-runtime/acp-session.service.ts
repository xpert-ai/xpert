import { TenantOrganizationAwareCrudService } from '@xpert-ai/server-core'
import { Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { FindOptionsWhere, In, Not, Repository } from 'typeorm'
import { AcpSession } from './acp-session.entity'

@Injectable()
export class AcpSessionService extends TenantOrganizationAwareCrudService<AcpSession> {
  constructor(
    @InjectRepository(AcpSession)
    protected readonly repository: Repository<AcpSession>
  ) {
    super(repository)
  }

  async update(id: string, entity: Partial<AcpSession>) {
    const current = await super.findOne(id)
    Object.assign(current, entity)
    return await this.repository.save(current)
  }

  async findReusableSession(input: {
    targetRef?: string | null
    targetKind?: AcpSession['targetKind']
    conversationId?: string | null
    threadId?: string | null
    xpertId?: string | null
    parentExecutionId?: string | null
    environmentId?: string | null
    workingDirectory?: string | null
    metadata?: Record<string, unknown> | null
  }): Promise<AcpSession | null> {
    const where: FindOptionsWhere<AcpSession> = {
      status: In(['ready', 'success', 'error']),
      mode: 'persistent'
    } as FindOptionsWhere<AcpSession>

    if (input.targetRef) {
      where.targetRef = input.targetRef
    }
    if (input.targetKind) {
      where.targetKind = input.targetKind
    }
    if (input.conversationId) {
      where.conversationId = input.conversationId
    }
    if (input.threadId) {
      where.threadId = input.threadId
    }
    if (input.xpertId) {
      where.xpertId = input.xpertId
    }
    if (input.parentExecutionId) {
      where.parentExecutionId = input.parentExecutionId
    }

    const candidates = await this.repository.find({
      where,
      order: {
        updatedAt: 'DESC'
      }
    })

    return candidates.find((candidate) => isCompatibleForReuse(candidate, input)) ?? null
  }

  async listSessions(filter?: {
    xpertId?: string
    conversationId?: string
    targetKind?: AcpSession['targetKind']
  }): Promise<AcpSession[]> {
    const where: FindOptionsWhere<AcpSession> = {
      status: Not('closed')
    } as FindOptionsWhere<AcpSession>

    if (filter?.xpertId) {
      where.xpertId = filter.xpertId
    }
    if (filter?.conversationId) {
      where.conversationId = filter.conversationId
    }
    if (filter?.targetKind) {
      where.targetKind = filter.targetKind
    }

    const result = await this.findAll({
      where,
      order: {
        updatedAt: 'DESC'
      }
    })

    return result.items
  }
}

function isCompatibleForReuse(
  session: Pick<AcpSession, 'environmentId' | 'workingDirectory' | 'metadata'>,
  input: {
    environmentId?: string | null
    workingDirectory?: string | null
    metadata?: Record<string, unknown> | null
  }
): boolean {
  const requestedEnvironmentId = readString(input.environmentId)
  if (requestedEnvironmentId && readString(session.environmentId) !== requestedEnvironmentId) {
    return false
  }

  const requestedXpertId = readString(input.metadata?.xpertId)
  if (requestedXpertId && readString(session.metadata?.xpertId) !== requestedXpertId) {
    return false
  }

  const requestedSourceConversationId = readString(input.metadata?.sourceConversationId)
  if (
    requestedSourceConversationId &&
    readString(session.metadata?.sourceConversationId) !== requestedSourceConversationId
  ) {
    return false
  }

  const requestedResumeThreadId = readString(input.metadata?.resumeThreadId)
  if (requestedResumeThreadId && readString(session.metadata?.resumeThreadId) !== requestedResumeThreadId) {
    return false
  }

  const requestedRepoId = readString(input.metadata?.repoId)
  if (requestedRepoId && readString(session.metadata?.repoId) !== requestedRepoId) {
    return false
  }

  const requestedRepoConnectionId = readString(input.metadata?.repoConnectionId)
  if (requestedRepoConnectionId && readString(session.metadata?.repoConnectionId) !== requestedRepoConnectionId) {
    return false
  }

  const requestedBranchName = readString(input.metadata?.branchName)
  if (requestedBranchName && readString(session.metadata?.branchName) !== requestedBranchName) {
    return false
  }

  const requestedCodingAgentName = readString(input.metadata?.codingAgentName)
  if (requestedCodingAgentName && readString(session.metadata?.codingAgentName) !== requestedCodingAgentName) {
    return false
  }

  const requestedWorkspacePath = readString(input.metadata?.workspacePath) ?? readString(input.workingDirectory)
  const currentWorkspacePath = readString(session.metadata?.workspacePath) ?? readString(session.workingDirectory)
  if (requestedWorkspacePath && currentWorkspacePath !== requestedWorkspacePath) {
    return false
  }

  return true
}

function readString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null
}
