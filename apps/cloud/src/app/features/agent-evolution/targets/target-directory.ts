import { resolveI18nText, type ActiveCapabilityPointer, type EvolutionTargetDescriptor } from '@xpert-ai/contracts'
import { evolutionScopeId } from '../agent-evolution.types'

export type TargetGroup = 'all' | 'live' | 'unversioned'
export interface TargetFilters {
  query: string
  status: 'all' | EvolutionTargetDescriptor['status']
  sort: 'displayName' | 'targetId'
  group: TargetGroup
}
export const defaultTargetFilters: TargetFilters = { query: '', status: 'all', sort: 'displayName', group: 'all' }

export function targetLabel(target: EvolutionTargetDescriptor, language: string) {
  return resolveI18nText(target.label, language) || target.displayName || target.targetId
}

export function directoryRows(
  targets: EvolutionTargetDescriptor[],
  pointers: ActiveCapabilityPointer[],
  filters: TargetFilters,
  language: string
) {
  const query = filters.query.trim().toLocaleLowerCase()
  const inProduction = new Map<string, ActiveCapabilityPointer[]>()
  for (const pointer of pointers) {
    if (pointer.channel !== 'production') continue
    const versions = inProduction.get(pointer.targetId)
    if (versions) versions.push(pointer)
    else inProduction.set(pointer.targetId, [pointer])
  }
  return targets
    .map((target) => {
      const active = inProduction.get(target.targetId) ?? []
      const name = targetLabel(target, language)
      return {
        target,
        name,
        versions: [...new Set(active.map((p) => p.activeVersionId))].sort(),
        scopeCount: new Set(active.map((p) => evolutionScopeId(p.scope))).size
      }
    })
    .filter(({ target, name }) => {
      const names = typeof target.label === 'object' ? Object.values(target.label) : []
      return (
        (filters.status === 'all' || target.status === filters.status) &&
        [name, target.displayName, target.targetId, target.providerKey, ...names].some((value) =>
          value?.toLocaleLowerCase().includes(query)
        )
      )
    })
    .sort(
      (a, b) =>
        a.target[filters.sort].localeCompare(b.target[filters.sort]) ||
        a.target.targetId.localeCompare(b.target.targetId)
    )
}

export function shortTargetVersion(version: string, targetId: string) {
  const prefix = targetId + ':'
  const name = version.startsWith(prefix) ? version.slice(prefix.length) : version
  return name.replace(/([0-9a-f]{8})-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, '$1…')
}
