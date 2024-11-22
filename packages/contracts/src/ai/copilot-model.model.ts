import { IBasePerTenantAndOrganizationEntityModel } from '../base-entity.model'
import { AiModelTypeEnum } from './ai-model.model'
import { ICopilot } from './copilot.model'

export interface ICopilotModel extends TCopilotModel, IBasePerTenantAndOrganizationEntityModel {}

export type TCopilotModel = {
  /**
   * Use a separate copilot
   */
  copilot?: ICopilot
  copilotId?: string

  /**
   * Referenced copilot model if not using a separate copilot
   */
  referencedModel?: ICopilotModel
  referencedId?: string

  modelType?: AiModelTypeEnum
  model?: string

  /**
   * Details config for ai model
   */
  options?: TCopilotModelOptions
}

export type TCopilotModelOptions = {
  [key: string]: any
}
