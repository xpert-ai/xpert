import type {
  ActiveCapabilityPointer,
  EvaluationRun,
  EvolutionLifecycleRecord,
  EvolutionTargetDescriptor,
  ImprovementProposal,
  ReleaseDeployment,
  ReleasePackage
} from '@xpert-ai/contracts'
import { sameEvolutionScope } from '../agent-evolution.types'
import { selectedReplayEvaluation } from '../shared/evolution-change-presentation'

export const overviewLabel = (key: string) => 'XP.AgentEvolution.Overview.' + key

interface Task {
  id: string
  title: string
  detailTitle?: string
  target: string
  group: string
  status: string
  action: string
  tone: 'muted' | 'warning' | 'danger' | 'info'
  icon: string
  route: string
  query: Record<string, string>
  fragment?: string
  priority: number
}

export function overviewTasks(
  records: EvolutionLifecycleRecord[],
  proposals: ImprovementProposal[],
  targets: EvolutionTargetDescriptor[],
  runs: EvaluationRun[],
  titleOf: (record: EvolutionLifecycleRecord) => string = (r) => r.presentation?.title || r.title
): Task[] {
  const name = (id: string) => targets.find((t) => t.targetId === id)?.displayName || id
  // Keep the overview a preview of recent changes and suggestions, not a total or a date filter.
  const changes: Task[] = records
    .filter((r) => !['closed', 'effective'].includes(r.phase))
    .slice(0, 4)
    .map((r) => {
      const fullTitle = titleOf(r)
      // Keep business text in the queue; full provider titles (including resource qualifiers) remain available on hover.
      const shortTitle = fullTitle
        .replace(/[(（][^()（）]*[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}[^()（）]*[)）]/gi, '')
        .trim()
      const releasing = !!r.publication || r.phase === 'publication'
      const row: Task = {
        id: 'change:' + r.id,
        title: shortTitle || fullTitle,
        detailTitle: fullTitle,
        target: name(r.targetId),
        status: r.status,
        group: releasing ? 'ReleaseRun' : r.phase === 'preparation' ? 'Build' : 'Assessment',
        icon: releasing ? 'ri-rocket-line' : 'ri-flask-line',
        tone: 'muted',
        priority: 5,
        route: releasing ? '../release' : '../evaluation',
        query: { changeId: r.id },
        action: releasing ? 'ViewRelease' : r.phase === 'preparation' ? 'ViewBuild' : 'ViewAssessment'
      }
      if (row.title === r.targetId) row.title = r.presentation?.resourceLabel || name(r.targetId)
      if (r.status === 'test_failed' || r.status === 'evaluation_failed') {
        row.priority = 0
        row.tone = 'danger'
        const run = selectedReplayEvaluation(runs, r.evaluation, r.id)
        const failed = run?.caseResults.find((c) => !c.candidatePassed || c.severeError)
        if (run) {
          row.query['runId'] = run.runId
          if (!run.caseResults.length) row.fragment = 'samples'
        }
        if (failed) {
          row.action = 'ViewFailures'
          row.query['caseId'] = failed.caseId
          row.fragment = 'samples'
        } else row.action = 'ViewAssessment'
      } else if (r.status === 'paused') {
        row.priority = 1
        row.icon = 'ri-pause-circle-line'
        row.action = 'ViewPause'
      } else if (r.phase === 'blocked') {
        row.priority = 1
        row.tone = 'danger'
        row.action = 'ViewBlocked'
      } else if (r.status === 'shadow' || r.status === 'canary') {
        row.priority = 2
        row.tone = 'info'
        row.action = r.status === 'shadow' ? 'ViewShadow' : 'ViewCanary'
        row.fragment = 'observations'
      } else if (r.phase === 'review') {
        row.priority = 2
        row.tone = 'warning'
        row.action = 'ViewReview'
        row.query['view'] = 'checks'
      }
      return row
    })
  const suggestions: Task[] = proposals
    .filter((p) => p.status === 'draft' || p.status === 'ready')
    .slice(0, 2)
    .map((p) => ({
      id: 'proposal:' + p.proposalId,
      title: p.title.replace(p.targetId, name(p.targetId)),
      target: name(p.targetId),
      status: p.status === 'ready' ? 'waiting_build' : 'needs_details',
      group: 'Suggestion',
      action: p.status === 'ready' ? 'ViewSuggestion' : 'CompleteSuggestion',
      icon: 'ri-lightbulb-line',
      priority: 3,
      tone: 'warning',
      route: '../learning',
      query: { proposalId: p.proposalId, ...(p.evidenceEventIds[0] ? { eventId: p.evidenceEventIds[0] } : {}) },
      fragment: 'proposal'
    }))
  return [...changes, ...suggestions].sort((a, b) => a.priority - b.priority)
}

export function activeImprovement(
  pointers: ActiveCapabilityPointer[],
  releases: ReleasePackage[],
  deployments: ReleaseDeployment[],
  records: EvolutionLifecycleRecord[]
) {
  for (const p of pointers
    .filter((p) => p.channel === 'production')
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))) {
    const release = releases.find(
      (r) =>
        r.status === 'active' &&
        r.releasePackageId === p.releasePackageId &&
        r.targetId === p.targetId &&
        r.targetVersionId === p.activeVersionId &&
        sameEvolutionScope(r.scope, p.scope)
    )
    if (!release) continue
    const record = records.find(
      (r) =>
        r.releasePackageId === release.releasePackageId &&
        r.targetId === p.targetId &&
        sameEvolutionScope(r.scope, p.scope)
    )
    if (!record) continue
    // Deployment totals are cumulative; never add its observation snapshots or count replay/canary traffic.
    const production = deployments.filter(
      (d) =>
        d.releasePackageId === release.releasePackageId &&
        d.channel === 'production' &&
        d.dataSource === 'runtime_telemetry' &&
        sameEvolutionScope(d.scope, p.scope)
    )
    const samples = production.reduce((n, d) => n + d.sampleCount, 0)
    return {
      record,
      samples,
      passed: production.reduce((n, d) => n + Math.round(d.candidateAccuracy * d.sampleCount), 0)
    }
  }
  return null
}

export function overviewRate(records: EvolutionLifecycleRecord[]) {
  const evaluated = records.filter((r) => r.evaluation)
  return { total: evaluated.length, passed: evaluated.filter((r) => r.evaluation!.passed).length }
}
