import { IAcpSession, TAgentExecutionMetadata, XpertAgentExecutionStatusEnum } from '@xpert-ai/contracts'
import { Injectable } from '@nestjs/common'

@Injectable()
export class AcpExecutionMapper {
  toExecutionMetadata(session: Pick<IAcpSession, 'id' | 'harnessType' | 'permissionProfile' | 'status'>, current?: TAgentExecutionMetadata | null): TAgentExecutionMetadata {
    return {
      provider: this.normalizeString(current?.provider) ?? 'acp',
      model: this.normalizeString(current?.model) ?? session.harnessType,
      runtimeKind: 'acp_session',
      harnessType: session.harnessType,
      permissionProfile: session.permissionProfile,
      acpSessionId: session.id,
      sessionStatus: session.status
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
