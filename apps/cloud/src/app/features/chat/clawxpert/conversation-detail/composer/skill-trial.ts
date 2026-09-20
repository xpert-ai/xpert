import type { RuntimeCapabilitiesSelection } from '@xpert-ai/chatkit-types'
import type { ClawXpertSkillTrialIntent } from '../../clawxpert-skill-trial-intent.service'

export function toSkillTrialRuntimeCapabilities(intent: ClawXpertSkillTrialIntent): RuntimeCapabilitiesSelection {
  return {
    mode: 'allowlist',
    skills: {
      workspaceId: intent.workspaceId,
      ids: [intent.skillPackageId]
    },
    plugins: {
      nodeKeys: []
    },
    subAgents: {
      nodeKeys: []
    }
  }
}

export function readNonEmptyString(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}
