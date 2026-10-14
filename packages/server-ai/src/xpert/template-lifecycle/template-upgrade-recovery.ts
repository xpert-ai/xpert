import { IXpert, TXpertTeamDraft } from '@xpert-ai/contracts'

/** Content comes from the reviewed snapshot; revision stamps come from the currently authorized Assistant. */
export function refreshAgentRevisions(
    snapshot: TXpertTeamDraft,
    current: Pick<IXpert, 'agent' | 'agents'>
): TXpertTeamDraft {
    const draft = structuredClone(snapshot)
    const agents = [current.agent, ...(current.agents ?? [])].filter(Boolean)
    for (const node of draft.nodes) {
        if (node.type !== 'agent') continue
        const live = agents.find((agent) => agent.key === node.key)
        if (live) node.entity = { ...node.entity, id: live.id, updatedAt: live.updatedAt }
    }
    return draft
}
