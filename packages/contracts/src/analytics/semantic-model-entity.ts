import { IBasePerTenantAndOrganizationEntityModel } from '../base-entity.model'

export type SemanticModelEntityOptions = {
  vector: {
    hierarchies: string[];
  };

  members?: Record<string, number>;
}

export type SemanticModelEntityJob = {
  id: string | number
  status?: 'completed' | 'failed' | 'processing' | 'cancel'
  progress?: number
  error?: string
}

export interface ISemanticModelEntity extends IBasePerTenantAndOrganizationEntityModel {
  name?: string
  caption?: string
  type?: ModelEntityType

  modelId?: string

  // 存放语义元数据
  options?: SemanticModelEntityOptions

  job?: SemanticModelEntityJob
}

export enum ModelEntityType {
  Cube = 'cube',
  Dimension = 'dimension'
}
