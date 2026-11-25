import { Injectable, inject } from '@angular/core'
import { HttpClient } from '@angular/common/http'
import { Router } from '@angular/router'
import { firstValueFrom } from 'rxjs'
import { parseWorkbenchEntry, parseWorkbenchEntryTarget, type WorkbenchEntryTarget } from '@xpert-ai/contracts'
import { API_PREFIX } from '../state/constants'
import { Store } from '../state'
import { OrganizationsService } from './organizations.service'
import { ScopeService } from './scope.service'

/** Cross-surface entry; notification read state and source business decisions stay with their owners. */
@Injectable({ providedIn: 'root' })
export class WorkbenchEntryNavigation {
  private readonly router = inject(Router)
  private readonly http = inject(HttpClient)
  private readonly store = inject(Store)
  private readonly organizations = inject(OrganizationsService)
  private readonly scope = inject(ScopeService)
  private revision = 0

  async open(value: WorkbenchEntryTarget) {
    const target = parseWorkbenchEntryTarget(value)
    const revision = ++this.revision
    const userId = this.store.user?.id
    const current = () => revision === this.revision && userId === this.store.user?.id
    if (target.organizationId && target.organizationId !== this.store.organizationId) {
      const organization = await firstValueFrom(this.organizations.getById(target.organizationId))
      if (!current() || organization.isActive === false) return false
      await this.scope.switchToOrganization(organization)
    } else if (!target.organizationId && this.store.organizationId) {
      await this.scope.switchToTenant()
    }
    if (!current()) return false
    if (target.target === 'project.pipelines') {
      return this.router.navigate(['/project', target.projectId, 'pipelines'], {
        queryParams: {
          pipelineInstanceId: target.pipelineInstanceId,
          pipelineRoundId: target.pipelineRoundId,
          pipelineNodeId: target.pipelineNodeId
        }
      })
    }
    const { projectId, viewKey, selectionId, parameters } = target
    const entry = parseWorkbenchEntry(
      await firstValueFrom(
        this.http.post<unknown>(`${API_PREFIX}/xpert/${target.assistantId}/workbench-navigation`, {
          projectId,
          viewKey,
          selectionId,
          parameters
        })
      )
    )
    if (!current() || (this.store.organizationId ?? null) !== target.organizationId) return false
    if (
      entry.organizationId !== target.organizationId ||
      entry.projectId !== projectId ||
      entry.view.viewKey !== viewKey ||
      entry.view.selectionId !== selectionId ||
      JSON.stringify(entry.view.parameters) !== JSON.stringify(parameters)
    )
      return false
    return this.router.navigate(['/chat/x', entry.assistant.id, ...(projectId ? ['p', projectId] : []), 'c'], {
      queryParams: {
        view: viewKey,
        viewSelection: selectionId ?? null,
        viewParameters: parameters ? JSON.stringify(parameters) : null
      }
    })
  }
}
