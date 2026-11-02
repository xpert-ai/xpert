import { AiModelTypeEnum } from '../agent'
import { IBasePerTenantAndOrganizationEntityModel } from '../base-entity.model'
import { IAiProviderEntity } from './ai-model.model'
import { ICopilot } from './copilot.model'
import type { ModelConfiguration, ModelDiscoveryState } from './model-discovery.model'
import type { EnabledModelSelection } from './model-management.model'

export interface ICopilotProvider extends IBasePerTenantAndOrganizationEntityModel {
  providerName?: string
  providerType?: string
  credentials?: Record<string, any>
  // encryptedConfig?: Record<string, any>
  isValid?: boolean
  lastUsed?: Date
  quotaType?: string
  quotaLimit?: number
  quotaUsed?: number

  /**
   */
  options?: Record<string, unknown> & { modelDiscovery?: ModelDiscoveryState; enabledModels?: EnabledModelSelection[] }

  copilot?: ICopilot
  copilotId?: string

  models?: ICopilotProviderModel[]

  // Temporary properties
  provider?: IAiProviderEntity
}

export interface ICopilotProviderModel extends IBasePerTenantAndOrganizationEntityModel {
  providerName?: string
  modelName?: string
  modelType?: AiModelTypeEnum
  // encryptedConfig?: Record<string, any>
  modelProperties?: Record<string, any> & {
    model_configuration?: ModelConfiguration
    discovery_model_id?: string
    configuration_source?: 'discovered' | 'manual'
  }
  isValid?: boolean

  // Many to one
  provider?: ICopilotProvider
  providerId?: string

  // Temporary properties
}

export type TCopilotProviderPublicDto = Omit<ICopilotProvider, 'credentials'>
