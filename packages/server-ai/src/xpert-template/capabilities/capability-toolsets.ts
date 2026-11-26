import { ConflictException } from '@nestjs/common'
import { t } from 'i18next'
import {
    XpertToolsetCategoryEnum,
    type AssistantCapabilityToolsetBinding,
    type TXpertTeamDraft
} from '@xpert-ai/contracts'

/** Connections are authoritative; publication derives Agent toolsetIds from these edges. */
export function bindCapabilityToolsets(draft: TXpertTeamDraft, bindings: readonly AssistantCapabilityToolsetBinding[]) {
    for (const { requirement, toolset } of bindings) {
        const agentKey = requirement.targetAgentKey ?? draft.team.agent?.key
        if (!draft.nodes.some((node) => node.type === 'agent' && node.key === agentKey))
            throw new ConflictException(t('server-ai:Error.CapabilityTargetMissing'))
        const existing = draft.nodes.find((node) => node.key === toolset.id)
        if (existing && (existing.type !== 'toolset' || existing.entity.id !== toolset.id))
            throw new ConflictException(t('server-ai:Error.AssistantCapabilityConflict'))
        if (!existing)
            draft.nodes.push({
                key: toolset.id,
                type: 'toolset',
                position: { x: 320, y: draft.nodes.length * 160 },
                entity: { ...toolset, category: XpertToolsetCategoryEnum.MCP }
            })
        if (
            draft.connections.some(
                (edge) => edge.type === 'toolset' && edge.from === agentKey && edge.to === toolset.id
            )
        )
            continue
        const key = `${agentKey}/${toolset.id}`
        if (draft.connections.some((edge) => edge.key === key))
            throw new ConflictException(t('server-ai:Error.AssistantCapabilityConflict'))
        draft.connections.push({ key, type: 'toolset', from: agentKey, to: toolset.id, required: true })
    }
}
