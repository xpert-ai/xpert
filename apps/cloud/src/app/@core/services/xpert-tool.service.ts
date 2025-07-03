import { inject, Injectable } from '@angular/core'
import { OrganizationBaseCrudService } from '@metad/cloud/state'
import { NGXLogger } from 'ngx-logger'
import { BehaviorSubject, Observable, tap } from 'rxjs'
import { API_XPERT_TOOL } from '../constants/app.constants'
import { IXpertTool } from '../types'

@Injectable({ providedIn: 'root' })
export class XpertToolService extends OrganizationBaseCrudService<IXpertTool> {
  readonly #logger = inject(NGXLogger)

  readonly #refresh = new BehaviorSubject<void>(null)

  constructor() {
    super(API_XPERT_TOOL)
  }

  test(tool: IXpertTool) {
    return this.httpClient.post(this.apiBaseUrl + `/test`, tool, { responseType: 'text' })
  }
  
  getParamsFaker(id: string) {
    return this.httpClient.get<Record<string, any>>(this.apiBaseUrl + `/${id}/faker`)
  }
}
