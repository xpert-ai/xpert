import type { EvaluationRun, EvolutionTargetDescriptor, ReplayCaseResult } from '@xpert-ai/contracts'
import { resolveI18nText } from '@xpert-ai/contracts'

export type CaseFilter = 'all' | 'improved' | 'regressed' | 'failed' | 'severe'
export function caseOutcome(row: ReplayCaseResult) {
  return row.candidatePassed ? (row.baselinePassed ? 'kept' : 'improved') : row.baselinePassed ? 'regressed' : 'failed'
}
export function filterCases(run: EvaluationRun, filter: CaseFilter) {
  return run.caseResults.filter(
    (row) => filter === 'all' || (filter === 'severe' ? row.severeError : caseOutcome(row) === filter)
  )
}
export function displayOutput(
  value: ReplayCaseResult['candidateOutput'],
  target: EvolutionTargetDescriptor | undefined,
  lang: string,
  raw = false
) {
  const entries = Object.entries(value)
  return (
    entries
      .map(([k, v]) => {
        const label = resolveI18nText(target?.feedbackVocabulary?.values?.[String(v)], lang)
        const text = raw ? String(v) : label || String(v)
        return entries.length > 1 ? k + ': ' + text : text
      })
      .join(' · ') || '—'
  )
}
export function compactId(value: string) {
  // Keep the type prefix and the first full UUID group; the full identity remains on the link/title.
  return value.replace(/^([\w]+-[0-9a-f]{8})-[0-9a-f-]+$/i, '$1')
}
export function bundleVersion(run: EvaluationRun, side: 'baselineBundle' | 'candidateBundle') {
  const items = run[side].items
  return (
    (items.find((i) => i.targetId === run.targetId) ?? (items.length === 1 ? items[0] : undefined))?.versionId ?? '—'
  )
}
