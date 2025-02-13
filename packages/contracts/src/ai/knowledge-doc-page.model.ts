import { IBasePerTenantAndOrganizationEntityModel } from '../base-entity.model'
import { Metadata } from './knowledge-doc.model'

export interface IKnowledgeDocumentPage extends IBasePerTenantAndOrganizationEntityModel {
  metadata?: Metadata
  pageContent?: string
}
