import type {
  EvaluationRun,
  EvolutionChangeEvaluation,
  EvolutionChange,
  EvolutionLifecycleRecord,
  EvolutionTargetDescriptor
} from '@xpert-ai/contracts'

export function selectedReplayEvaluation(
  runs: EvaluationRun[],
  assessment: EvolutionChangeEvaluation | undefined,
  candidateId: string | undefined
) {
  const evidence = new Set(assessment?.checks.flatMap((check) => check.evidenceRefs) ?? [])
  return runs.find((run) => run.candidateId === candidateId && evidence.has(run.runId)) ?? null
}

export type EvolutionChangeFilter = string
export type EvolutionChangeEntry = EvolutionLifecycleRecord
export function changeFilter(value: string | null): EvolutionChangeFilter {
  return value || 'all'
}
export function changeTitle(change: EvolutionChange, targets: EvolutionTargetDescriptor[]) {
  return (
    change.presentation?.title ||
    targets.find((target) => target.targetId === change.targetId)?.displayName ||
    change.targetId
  )
}
export function evolutionEntries(
  records: EvolutionLifecycleRecord[],
  targets: EvolutionTargetDescriptor[],
  page: 'evaluation' | 'release'
): EvolutionChangeEntry[] {
  return records
    .filter((item) => page === 'evaluation' || ['publication', 'effective'].includes(item.phase) || !!item.publication)
    .map((item) => ({
      ...item,
      title:
        item.presentation?.title ||
        `${targets.find((target) => target.targetId === item.targetId)?.displayName || item.targetId} · ${item.title}`
    }))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt) || a.id.localeCompare(b.id))
}
export function selectedEvolutionEntry(
  entries: EvolutionChangeEntry[],
  filter: EvolutionChangeFilter,
  id: string | null
) {
  const visible = entries.filter((item) => filter === 'all' || item.publicationStatus === filter)
  return id ? (visible.find((item) => item.id === id) ?? null) : (visible[0] ?? null)
}

export function changeWorkbenchLink(change: EvolutionChange, page: 'evaluation' | 'release') {
  const target =
    page === 'release'
      ? (change.presentation?.historyWorkbench ?? change.presentation?.workbench)
      : change.presentation?.workbench
  if (!target?.xpertId || !target.viewKey || !target.selectionId) return null
  return {
    commands: ['/chat/x', target.xpertId, 'c'],
    queryParams: {
      view: target.viewKey,
      viewSelection: target.selectionId,
      viewParameters: JSON.stringify(target.parameters)
    }
  }
}
