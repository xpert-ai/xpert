import { TAcpTargetKind } from '@xpert-ai/contracts'
import { Injectable } from '@nestjs/common'
import { AcpTargetService } from '../acp-target.service'
import { ResolvedAcpTarget } from './acp-backend.types'

const BUILTIN_TARGETS: Record<TAcpTargetKind, ResolvedAcpTarget> = {
  remote_xpert_acp: {
    id: 'remote_xpert_acp',
    label: 'Codexpert Remote ACP',
    description: 'Codexpert HTTP ACP endpoint used by ClawXpert coding delegation.',
    kind: 'remote_xpert_acp',
    transport: 'http',
    commandOrEndpoint: readEnv('CODEXPERT_ACP_BASE_URL') ?? readEnv('XPERT_CODEXPERT_ACP_ENDPOINT') ?? null,
    authRef: readEnv('CODEXPERT_ACP_SERVICE_TOKEN') ?? readEnv('ACP_SERVICE_TOKEN') ?? null,
    defaultMode: 'persistent',
    permissionProfile: 'workspace_write',
    timeoutSeconds: 15 * 60,
    enabled: true,
    capabilities: {
      supportsModes: ['oneshot', 'persistent'],
      supportsStreaming: true,
      supportsToolCall: true,
      supportsArtifacts: true,
      controls: ['cancel', 'close']
    },
    metadata: null,
    builtin: true
  }
}

function readEnv(name: string): string | null {
  const value = process.env[name]
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null
}

@Injectable()
export class AcpTargetRegistry {
  constructor(private readonly targetService: AcpTargetService) {}

  async listVisibleTargets(): Promise<ResolvedAcpTarget[]> {
    const persisted = await this.targetService.listEnabled()
    return [
      BUILTIN_TARGETS.remote_xpert_acp,
      ...persisted.filter((target) => target.kind === 'remote_xpert_acp').map((target) => ({ ...target, builtin: false }))
    ]
  }

  async resolve(refOrKind?: string | null): Promise<ResolvedAcpTarget | null> {
    if (!refOrKind) {
      return null
    }

    const builtin = BUILTIN_TARGETS[refOrKind as TAcpTargetKind]
    if (builtin) {
      return builtin
    }

    const target = await this.targetService.findOne(refOrKind)
    if (!target) {
      return null
    }

    return {
      ...target,
      builtin: false
    }
  }

}
