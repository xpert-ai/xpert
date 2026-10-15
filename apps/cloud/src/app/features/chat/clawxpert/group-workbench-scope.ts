// A group route must never render a personal View while its shared runtime is resolving.
import { computed, effect, signal } from '@angular/core'
import { firstValueFrom } from 'rxjs'
import type { XpertViewRuntimeScopeInput } from '@xpert-ai/contracts'
import type { GroupWorkbenchApiService } from '../../../@core/services/group-workbench-api.service'

export function createGroupWorkbenchScope(input: {
  groupId: () => string | null
  identity: () => string | null
  assistantId: () => string | null
  ready: () => boolean
  api: Pick<GroupWorkbenchApiService, 'getContext'>
  onError: (error: unknown) => void
}) {
  const key = computed(() =>
    input.ready() ? JSON.stringify([input.identity(), input.groupId(), input.assistantId()]) : null
  )
  const resolved = signal<{ key: string; scope: XpertViewRuntimeScopeInput } | null>(null)
  effect((cleanup) => {
    const currentKey = key()
    const groupId = input.groupId()
    const assistantId = input.assistantId()
    if (!currentKey || !groupId || !assistantId) return
    let cancelled = false
    cleanup(() => {
      cancelled = true
    })
    void firstValueFrom(input.api.getContext(groupId))
      .then((context) => {
        if (cancelled) return
        if (context.assistantId !== assistantId || !context.conversationId) {
          throw new Error('Invalid group Workbench context')
        }
        resolved.set({
          key: currentKey,
          scope: { groupId, projectId: context.projectId, conversationId: context.conversationId }
        })
      })
      .catch((error: unknown) => {
        if (!cancelled) input.onError(error)
      })
  })
  return computed(() => (input.groupId() && resolved()?.key === key() ? resolved().scope : null))
}
