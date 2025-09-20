import { Document } from '@langchain/core/documents'
import { IBasePerTenantAndOrganizationEntityModel } from '../base-entity.model'

export interface IKnowledgeDocumentPage<Metadata extends Record<string, any> = Record<string, any>> extends Document, IBasePerTenantAndOrganizationEntityModel {
  metadata: Metadata
  pageContent: string
}
