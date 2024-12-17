import { inject, Injectable } from '@angular/core'
import { OrganizationBaseCrudService } from '@metad/cloud/state'
import { NGXLogger } from 'ngx-logger'
import { API_COPILOT_STORE } from '../constants/app.constants'
import { ICopilotStore } from '../types'

@Injectable({ providedIn: 'root' })
export class CopilotStoreService extends OrganizationBaseCrudService<ICopilotStore> {
  readonly #logger = inject(NGXLogger)

  constructor() {
    super(API_COPILOT_STORE)
  }

}
