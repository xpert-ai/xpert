import { hasRuntimePresentation, type TChatAgentRunSummary, type TStoredChatAgentRuns } from '@xpert-ai/contracts'

export function readAgentRunSnapshot(
    snapshot: TStoredChatAgentRuns | null | undefined,
    omittedLegacyIds?: ReadonlySet<string>
): TChatAgentRunSummary[] {
    if (!Array.isArray(snapshot)) return snapshot?.version === 1 && Array.isArray(snapshot.runs) ? snapshot.runs : []
    return snapshot.filter(
        (run) =>
            !hasRuntimePresentation(run) &&
            (run.isRoot || run.presentation === 'event' || !omittedLegacyIds?.has(run.id))
    )
}
