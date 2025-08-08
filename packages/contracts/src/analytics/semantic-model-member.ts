import { IBasePerTenantAndOrganizationEntityModel } from "../base-entity.model"
import { ISemanticModel } from "./semantic-model"
import { ISemanticModelEntity } from "./semantic-model-entity"

export interface ISemanticModelMember extends IBasePerTenantAndOrganizationEntityModel {

  modelId?: string
  model?: ISemanticModel

  entityId?: string
  entity?: ISemanticModelEntity

  cube: string

  dimension: string

  hierarchy: string

  level: string

  language: string

  memberUniqueName: string

  memberKey?: string

  memberName: string

  memberCaption: string

  memberOrdinal: number

  memberType: number

  levelNumber: number

  parentUniqueName: string

  // Has Vector
  vector?: boolean
}

export function embeddingCubeCollectionName(modelKey: string, cube: string, isDraft?: boolean): string {
	return `${modelKey}:${cube}${isDraft ? ':draft' : ''}`
}