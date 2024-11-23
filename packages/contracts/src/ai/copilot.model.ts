import { IBasePerTenantAndOrganizationEntityModel } from '../base-entity.model'
import { AiProvider } from './ai.model'
import { ICopilotModel } from './copilot-model.model'
import { ICopilotProvider } from './copilot-provider.model'

export interface ICopilot extends IBasePerTenantAndOrganizationEntityModel {
  role: AiProviderRole
  enabled?: boolean
  /**
   * @deprecated use modelProvider
   */
  provider?: AiProvider
  /**
   * @deprecated
   */
  apiKey?: string
  /**
   * @deprecated
   */
  apiHost?: string
  /**
   * @deprecated use copilotModel
   */
  defaultModel?: string

  showTokenizer?: boolean
  /**
   * Balance of Token 
   */
  tokenBalance?: number

  /**
   * Details config for openai api
   */
  options?: any

  modelProvider?: ICopilotProvider
  copilotModel?: ICopilotModel
}

/**
 * The order of priority is: `Embedding`, `Secondary`, `Primary`
 */
export enum AiProviderRole {
  Primary = 'primary',
  Secondary = 'secondary',
  Embedding = 'embedding',
}
