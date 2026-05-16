import { IBasePerTenantAndOrganizationEntityModel } from '../base-entity.model'

export interface IAiProvider extends IBasePerTenantAndOrganizationEntityModel {
  /**
   * Provider identifier, such as 'openai'
   */
  name: string

  /**
   * Provider display name
   */
  label: string

  /**
   * Provider description
   */
  description: string

  /**
   * Provider small icon
   */
  iconSmall: string

  /**
   * Provider large icon
   */
  iconLarge: string

  /**
   * Background color
   */
  background: string

  /**
   * Help information title
   */
  helpTitle: string

  /**
   * Help information URL
   */
  helpUrl: string

  /**
   * Supported model types
   */
  supportedModelTypes: string[]

  /**
   * Configuration methods
   */
  configurateMethods: string[]
}
