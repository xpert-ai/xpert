import { IAcpSession, TAgentExecutionMetadata, XpertAgentExecutionStatusEnum } from '@xpert-ai/contracts'
import { Injectable } from '@nestjs/common'

@Injectable()
export class AcpExecutionMapper {
  toExecutionMetadata(
    session: Pick<
      IAcpSession,
      'id' | 'environmentId' | 'harnessType' | 'metadata' | 'permissionProfile' | 'status' | 'targetRef' | 'targetKind'
    >,
    current?: TAgentExecutionMetadata | null,
    overrides?: Partial<TAgentExecutionMetadata>
  ): TAgentExecutionMetadata {
    const metadata = session.metadata ?? {}

    return {
      provider: this.normalizeString(current?.provider) ?? 'acp',
      model: this.normalizeString(current?.model) ?? session.harnessType,
      runtimeKind: 'acp_session',
      harnessType: session.harnessType,
      permissionProfile: session.permissionProfile,
      acpSessionId: session.id,
      acpTargetRef: this.normalizeString(session.targetRef) ?? undefined,
      acpTargetKind: session.targetKind ?? undefined,
      sessionStatus: session.status,
      phase: session.metadata?.phase ?? undefined,
      triggerSource: 'acp',
      environmentId: this.normalizeString(session.environmentId) ?? undefined,
      sandboxEnvironmentId: this.normalizeString(metadata.sandboxEnvironmentId) ?? undefined,
      projectId: this.normalizeString(metadata.projectId) ?? undefined,
      requestedUserId: this.normalizeString(metadata.ownerUserId) ?? this.normalizeString(metadata.userId) ?? undefined,
      effectiveUserId: this.normalizeString(metadata.effectiveUserId) ?? this.normalizeString(metadata.userId) ?? undefined,
      sourceConversationIdSnapshot: this.normalizeString(metadata.sourceConversationId) ?? undefined,
      resumeThreadIdSnapshot: this.normalizeString(metadata.resumeThreadId) ?? undefined,
      repoConnectionIdSnapshot: this.normalizeString(metadata.repoConnectionId) ?? undefined,
      repoIdSnapshot: this.normalizeString(metadata.repoId) ?? undefined,
      repoNameSnapshot: this.normalizeString(metadata.repoName) ?? undefined,
      repoOwnerSnapshot: this.normalizeString(metadata.repoOwner) ?? undefined,
      repoSlugSnapshot: this.normalizeString(metadata.repoSlug) ?? undefined,
      branchNameSnapshot: this.normalizeString(metadata.branchName) ?? undefined,
      baseBranchNameSnapshot: this.normalizeString(metadata.baseBranchName) ?? undefined,
      workspaceLabelSnapshot: this.normalizeString(metadata.workspaceLabel) ?? undefined,
      workspacePathSnapshot: this.normalizeString(metadata.workspacePath) ?? undefined,
      codingAgentNameSnapshot: this.normalizeString(metadata.codingAgentName) ?? undefined,
      providerDisplayNameSnapshot: this.normalizeString(metadata.providerDisplayName) ?? undefined,
      taskKind: this.normalizeString(metadata.taskKind) ?? undefined,
      taskIntent: this.normalizeString(metadata.taskIntent) ?? undefined,
      lastObservationAt: this.normalizeString(metadata.lastObservationAt) ?? undefined,
      lastObservationSequence:
        typeof metadata.lastObservationSequence === 'number' ? metadata.lastObservationSequence : undefined,
      lastUpstreamHandoff: this.normalizeString(metadata.lastUpstreamHandoff) ?? undefined,
      ...(overrides ?? {})
    }
  }

  toExecutionStatus(status: IAcpSession['status']): XpertAgentExecutionStatusEnum {
    switch (status) {
      case 'running':
        return XpertAgentExecutionStatusEnum.RUNNING
      case 'queued':
      case 'pending':
        return XpertAgentExecutionStatusEnum.PENDING
      case 'success':
        return XpertAgentExecutionStatusEnum.SUCCESS
      case 'timeout':
        return XpertAgentExecutionStatusEnum.TIMEOUT
      case 'canceled':
        return XpertAgentExecutionStatusEnum.INTERRUPTED
      case 'error':
      default:
        return XpertAgentExecutionStatusEnum.ERROR
    }
  }

  private normalizeString(value: unknown): string | null {
    return typeof value === 'string' && value.length > 0 ? value : null
  }
}
