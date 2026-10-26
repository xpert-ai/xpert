import type {
  EvolutionCandidate,
  EvolutionPage,
  EvolutionTargetDescriptor,
  EvaluationRun,
  LearningEvent,
  ReleaseDeployment
} from '@xpert-ai/contracts'
import { EMPTY, Observable, expand, last, map, take } from 'rxjs'
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
      return exactResource(
        (page) => api.listTargets(query(page)),
        (item) => item.targetId === id
      )
    case 'candidate':
      return exactResource(
        (page) => api.listCandidates(query(page)),
        (item) => item.candidateId === id
      )
    case 'evaluation':
      return exactResource(
        (page) => api.listEvaluations(query(page)),
        (item) => item.runId === id
      )
    case 'deployment':
      return exactResource(
        (page) => api.listDeployments(query(page)),
        (item) => item.deploymentId === id
      )
  }
}

export function findLearningEvent(api: AgentEvolutionApiService, id: string): Observable<LearningEvent | null> {
  return exactResource(
    (page) => api.listLearningEvents({ page, pageSize: 20, search: id }),
    (item) => item.eventId === id
  )
}
