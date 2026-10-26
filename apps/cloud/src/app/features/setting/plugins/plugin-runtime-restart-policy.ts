import type { IPluginRuntimeSnapshot, IRuntimePluginRequirement } from '@xpert-ai/contracts'
import type { PendingPluginRuntimeRestart } from '@cloud/app/@core/services/plugin-restart-storage'

export function currentRequirements(pending: PendingPluginRuntimeRestart, snapshot: IPluginRuntimeSnapshot) {
  const requirements = pending.runtimeRequirements ?? []
  if (!requirements.length) return null
  const current = requirements.map((item) =>
    snapshot.requirements.find(
      (candidate) => candidate.scopeKey === item.scopeKey && candidate.pluginName === item.pluginName
    )
  )
  if (!current.every((item): item is IRuntimePluginRequirement => !!item)) return null
  const unpublished = pending.unpublishedRequirements ?? []
  if (
    !unpublished.every((item) =>
      current.some(
        (candidate) =>
          item.scopeKey === candidate.scopeKey &&
          item.pluginName === candidate.pluginName &&
          item.state === candidate.state &&
          item.version === candidate.version &&
          item.runtimeRevision === candidate.runtimeRevision
      )
    )
  )
    return null
  return current
}

export function isRestartResolved(pending: PendingPluginRuntimeRestart, snapshot: IPluginRuntimeSnapshot) {
  if (snapshot.status !== 'completed' || snapshot.activeRestartId) return false
  if (pending.generation && snapshot.generation < pending.generation) return false
  if (pending.runtimeRequirements?.length) return currentRequirements(pending, snapshot) !== null
  // A generation is server-owned evidence; a bare manual restart is not.
  return !!pending.generation && snapshot.generation >= pending.generation
}
