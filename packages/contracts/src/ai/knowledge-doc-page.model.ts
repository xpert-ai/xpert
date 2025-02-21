import { Document } from '@langchain/core/documents'
import { IBasePerTenantAndOrganizationEntityModel } from '../base-entity.model'
import { Metadata } from './knowledge-doc.model'

export interface IKnowledgeDocumentPage extends Document, IBasePerTenantAndOrganizationEntityModel {
  metadata: Metadata
  pageContent: string
}
