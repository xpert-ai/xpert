import { inject, Injectable } from '@angular/core'
import { API_PREFIX, ISkillPackage } from '@metad/cloud/state'
import { NGXLogger } from 'ngx-logger'
import { XpertWorkspaceBaseCrudService } from './xpert-workspace.service'

@Injectable({ providedIn: 'root' })
export class SkillPackageService extends XpertWorkspaceBaseCrudService<ISkillPackage> {
  readonly #logger = inject(NGXLogger)

  constructor() {
    super(`${API_PREFIX}/skill-package`)
  }

  installPackage(workspaceId: string, indexId: string) {
    return this.httpClient.post(`${this.apiBaseUrl}/install`, { workspaceId, indexId })
  }

  uploadPackage(workspaceId: string, file: File) {
    const formData = new FormData()
    formData.append('file', file)
    return this.httpClient.post<ISkillPackage[]>(
      `${this.apiBaseUrl}/workspace/${workspaceId}/upload`,
      formData
    )
  }

  uninstallPackages(ids: string[]) {
    return this.httpClient.delete(`${this.apiBaseUrl}/uninstall`, {
      body: ids
    })
  }
}

export function injectSkillPackageAPI() {
  return inject(SkillPackageService)
}
