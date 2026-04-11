import { inject, Injectable } from '@angular/core'
import { OrganizationBaseCrudService } from '@xpert-ai/cloud/state'
import { NGXLogger } from 'ngx-logger'
import { API_COPILOT_MODEL } from '../constants/app.constants'
import { ICopilotModel } from '../types'

@Injectable({ providedIn: 'root' })
export class CopilotModelService extends OrganizationBaseCrudService<ICopilotModel> {
  readonly #logger = inject(NGXLogger)

  constructor() {
    super(API_COPILOT_MODEL)
  }
}
