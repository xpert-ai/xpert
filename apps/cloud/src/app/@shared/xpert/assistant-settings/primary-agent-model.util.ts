import { isEqual } from 'lodash-es'
import type { TXpertTeamDraft } from '@xpert-ai/contracts'

export function clearLegacyInheritedPrimaryAgentModel(
  draft: Partial<TXpertTeamDraft> | null | undefined
): TXpertTeamDraft['nodes'] | null {
  const primaryAgentKey = draft?.team?.agent?.key
  const primaryNode = draft?.nodes?.find(
    (node) => node.type === 'agent' && (node.key === primaryAgentKey || node.entity.key === primaryAgentKey)
  )
  if (!draft?.nodes || !primaryNode || primaryNode.type !== 'agent') {
    return null
  }

  const legacyTeamModel = draft.team.agent?.copilotModel ?? draft.team.copilotModel
  if (!primaryNode.entity.copilotModel || !isEqual(primaryNode.entity.copilotModel, legacyTeamModel)) {
    return null
  }

  return draft.nodes.map((node) =>
    node.key === primaryNode.key && node.type === 'agent'
      ? {
          ...node,
          entity: {
            ...node.entity,
            copilotModel: undefined,
            copilotModelId: undefined
          }
        }
      : node
  )
}
