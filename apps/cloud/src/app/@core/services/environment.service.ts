import { Injectable } from '@angular/core'
import { API_PREFIX } from '@metad/cloud/state'
import { IEnvironment } from '../types'
import { XpertWorkspaceBaseCrudService } from './xpert-workspace.service'

export const API_ENVIRONMENT = API_PREFIX + '/environment'

@Injectable({
  providedIn: 'root'
})
export class EnvironmentService extends XpertWorkspaceBaseCrudService<IEnvironment> {
  constructor() {
    super(API_ENVIRONMENT)
  }

  setDefault(envId: string) {
    return this.httpClient.put(this.apiBaseUrl + `/${envId}/as-default`, {})
  }

  getDefaultByWorkspace(workspaceId: string) {
    return this.httpClient.get<IEnvironment>(this.apiBaseUrl + `/default/${workspaceId}`)
  }
}
