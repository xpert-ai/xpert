import { AiModelTypeEnum } from '../agent'
import { IBasePerTenantAndOrganizationEntityModel } from '../base-entity.model'
import { ICopilot } from './copilot.model'
import type { ModelFeature } from './ai-model.model'

/** Public catalog metadata for model selectors; excludes credentials and runtime configuration. */
export interface ModelSelectionMetadata {
  provider?: { id: string; label: string; iconUrl?: string }
  connectionName?: string
  features?: ModelFeature[]
  /** Declared context capacity in tokens, not usage. */
  contextWindow?: number
}

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
  /**
   * Max input context size of selected model
   */
  context_size?: number
  /** Client retry policy, independent of the selected model's generation parameters. */
  maxRetries?: number
  /** Optional generation parameters use null to persist an explicit unset value. */
  [key: string]: any
}
