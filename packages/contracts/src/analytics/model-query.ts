import { IBasePerTenantAndOrganizationEntityModel } from '../base-entity.model'
import { ISemanticModel } from './semantic-model'

export interface IModelQuery extends IBasePerTenantAndOrganizationEntityModel {
  key: string
  modelId: string
  model?: ISemanticModel
  name: string
  /**
   * Index of the query in the list of queries in model
   */
  index?: number
  /**
   * The details
   */
  options?: {
    type?: 'sql' | 'mdx'
    entities?: string[]
    statement?: string
    conversations?: any[]
  }
}
