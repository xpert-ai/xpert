import { inject, Injectable } from '@angular/core'
import { API_PREFIX } from '@cloud/app/@core/state'
import type { XpertViewRuntimeScopeInput } from '@xpert-ai/contracts'
import { injectApiBaseUrl } from '../providers'
import { GroupWorkbenchApiService } from './group-workbench-api.service'

/** Selects the authorized route family without changing the view's data or action protocol. */
@Injectable({ providedIn: 'root' })
export class ViewExtensionRouteService {
  private readonly groups = inject(GroupWorkbenchApiService)
  private readonly baseUrl = `${injectApiBaseUrl()}${API_PREFIX}/view-hosts`

  getHostUrl(hostType: string, hostId: string, scope?: XpertViewRuntimeScopeInput) {
    // The group endpoint revalidates membership, Assistant binding and runtime scope on every request.
    if (scope?.groupId) return this.groups.getViewHostUrl(scope.groupId, hostType, hostId)
    return `${this.baseUrl}/${encodeURIComponent(hostType)}/${encodeURIComponent(hostId)}`
  }
}
