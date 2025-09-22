import { Document } from '@langchain/core/documents'
import { IBasePerTenantAndOrganizationEntityModel } from '../base-entity.model'
import { IKnowledgeDocument } from './knowledge-doc.model'
import { DocumentMetadata, IKnowledgebase } from './knowledgebase.model'


/**
 * Segmented page of a knowledge document
 */
export interface IKnowledgeDocumentPage<Metadata extends DocumentMetadata = DocumentMetadata>
  extends Document,
    IBasePerTenantAndOrganizationEntityModel {
  documentId?: string
  document?: IKnowledgeDocument
  knowledgebaseId?: string
  knowledgebase?: IKnowledgebase
  
  metadata: Metadata
  pageContent: string
}
