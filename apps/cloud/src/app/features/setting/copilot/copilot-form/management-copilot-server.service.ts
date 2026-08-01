import { Injectable } from '@angular/core'
import { CopilotServerService } from '@cloud/app/@core'
import { AiModelTypeEnum } from '@xpert-ai/contracts'

@Injectable()
export class ManagementCopilotServerService extends CopilotServerService {
  override getCopilotModels(type: AiModelTypeEnum) {
    return this.getManagementCopilotModels(type)
  }
}
