import { DefaultModelRole, LegacyProviderRole } from './default-model-role'
import { IBasePerTenantAndOrganizationEntityModel } from '../base-entity.model'
import { ICopilotModel } from './copilot-model.model'
import { ICopilotProvider } from './copilot-provider.model'

export interface ICopilot extends IBasePerTenantAndOrganizationEntityModel {
  name?: string
  /** @deprecated Connection roles are read only for legacy defaults and setup compatibility. */
  role?: LegacyProviderRole
  enabled?: boolean

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

  // Temporary properties
  usage?: TCopilotTokenUsage
  /** Explicit role defaults projected into the public catalog, independent of the legacy connection role. */
  defaultModels?: Partial<Record<DefaultModelRole, ICopilotModel>>
  configuredDefaultRoles?: DefaultModelRole[]
}

/** @deprecated Use DefaultModelRole for default assignments; connections have no default purpose. */
export enum AiProviderRole {
  Primary = 'primary',
  Secondary = 'secondary',
  Embedding = 'embedding',
  Reasoning = 'reasoning'
}

export type TCopilotTokenUsage = {
  // Token limit for the current period
  tokenLimit?: number
  priceLimit?: number
  // Tokens used in the current period
  tokenUsed?: number
  priceUsed?: number

  currency?: string
}
