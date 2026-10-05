import { firstValueFrom } from 'rxjs'
import { isEqual } from 'lodash-es'
import type { XpertSettingsSource } from '@cloud/app/@shared/xpert/assistant-settings/xpert-settings.types'
import type { XpertStudioApiService } from '../domain/xpert-api.service'

/** Bind settings to the live canvas; never create a second draft store. */
export function createStudioSettingsSource(
  api: Pick<
    XpertStudioApiService,
    | 'storage'
    | 'viewModel'
    | 'team'
    | 'unsaved'
    | 'draftSaving'
    | 'draftSaveError'
    | 'saveDraft'
    | 'getXpertTeam'
    | 'initRole'
    | 'refreshSettingsView'
  > & { _draft: Pick<XpertStudioApiService['_draft'], 'set'> }
): XpertSettingsSource {
  const id = api.storage.team.id
  let baseline = structuredClone(api.storage)
  let baselineUnsaved = api.unsaved()
  return {
    id,
    draft: api.viewModel,
    workspaceDataScope: api.team().workspaceDataScope ?? 'shared',
    saving: api.draftSaving,
    unsaved: api.unsaved,
    error: api.draftSaveError,
    update: (change) => {
      if (api.storage.team.id !== id) return
      api._draft.set(change(api.storage))
      api.unsaved.set(baselineUnsaved || !isEqual(api.storage, baseline))
      api.refreshSettingsView()
    },
    save: async () => {
      if (api.storage.team.id !== id) return
      const snapshot = structuredClone(api.storage)
      await firstValueFrom(api.saveDraft())
      baseline = snapshot
      baselineUnsaved = false
    },
    reload: async () => {
      const latest = await firstValueFrom(api.getXpertTeam(id))
      if (api.storage.team.id !== id || api.unsaved() || api.draftSaving()) return
      api.initRole(latest)
      baseline = structuredClone(api.storage)
      baselineUnsaved = false
    },
    discard: () => {
      if (api.storage.team.id !== id || api.draftSaving()) return
      api._draft.set(structuredClone(baseline))
      api.unsaved.set(baselineUnsaved)
      api.draftSaveError.set(null)
      api.refreshSettingsView()
    }
  }
}
