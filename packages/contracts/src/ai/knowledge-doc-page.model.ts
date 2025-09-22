import { Document } from '@langchain/core/documents'
import { IBasePerTenantAndOrganizationEntityModel } from '../base-entity.model'
import { IKnowledgeDocument } from './knowledge-doc.model'
import { IKnowledgebase } from './knowledgebase.model'

export interface IKnowledgeDocumentPage<Metadata extends Record<string, any> = Record<string, any>>
  extends Document,
    IBasePerTenantAndOrganizationEntityModel {
  documentId?: string
  document?: IKnowledgeDocument
  knowledgebaseId?: string
  knowledgebase?: IKnowledgebase
  
  metadata: Metadata
  pageContent: string
}
