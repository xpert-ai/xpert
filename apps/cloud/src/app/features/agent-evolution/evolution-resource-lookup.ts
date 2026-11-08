import type {
  EvolutionCandidate,
  EvolutionPage,
  EvolutionTargetDescriptor,
  EvaluationRun,
  LearningEvent,
  ReleaseDeployment
} from '@xpert-ai/contracts'
import { EMPTY, Observable, expand, last, map, of, take } from 'rxjs'
import { AgentEvolutionApiService } from './agent-evolution-api.service'

export type EvolutionDetailKind = 'target' | 'candidate' | 'evaluation' | 'deployment'
export type EvolutionDetailResource = EvolutionTargetDescriptor | EvolutionCandidate | EvaluationRun | ReleaseDeployment

/** Resolve a search destination beyond the dashboard's first page, without changing dashboard filters. */
function exactResource<T>(
  load: (page: number) => Observable<EvolutionPage<T>>,
  matches: (item: T) => boolean
): Observable<T | null> {
  return load(1).pipe(
    take(1),
    expand((page) =>
      !page.items.some(matches) && page.items.length && page.page * page.pageSize < page.total
        ? load(page.page + 1).pipe(take(1))
        : EMPTY
    ),
    last(),
    map((page) => page.items.find(matches) ?? null)
  )
}

export function findEvolutionResource(
  api: AgentEvolutionApiService,
  kind: EvolutionDetailKind,
  id: string
): Observable<EvolutionDetailResource | null> {
  const query = (page: number) => ({ page, pageSize: 20, search: id })
  switch (kind) {
    case 'target':
      return findEvolutionTarget(api, id)
    case 'candidate':
      return exactResource(
        (page) => api.listCandidates(query(page)),
        (item) => item.candidateId === id
      )
    case 'evaluation':
      return findHistoricalRun(api, id)
    case 'deployment':
      return findHistoricalDeployment(api, id)
  }
}

export function findEvolutionTarget(
  api: AgentEvolutionApiService,
  targetId: string
): Observable<EvolutionTargetDescriptor | null> {
  return exactResource(
    (page) => api.listTargets({ page, pageSize: 20, search: targetId }),
    (target) => target.targetId === targetId
  )
}

export function findHistoricalRun(api: AgentEvolutionApiService, runId: string): Observable<EvaluationRun | null> {
  return exactResource(
    (page) => api.listEvaluations({ page, pageSize: 20, search: runId }),
    (item) => item.runId === runId
  )
}

export function findHistoricalDeployment(
  api: AgentEvolutionApiService,
  deploymentId: string
): Observable<ReleaseDeployment | null> {
  if (!deploymentId) return of(null)
  return exactResource(
    (page) => api.listDeployments({ page, pageSize: 20, search: deploymentId }),
    (item) => item.deploymentId === deploymentId
  )
}

export function findLearningEvent(api: AgentEvolutionApiService, id: string): Observable<LearningEvent | null> {
  return exactResource(
    (page) => api.listLearningEvents({ page, pageSize: 20, search: id }),
    (item) => item.eventId === id
  )
}
