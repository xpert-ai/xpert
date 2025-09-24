import { IBasePerTenantAndOrganizationEntityModel } from '../base-entity.model'
import { IKnowledgeDocument } from './knowledge-doc.model'
import { IKnowledgebase } from './knowledgebase.model'

/**
 * Task executions of a knowledge document
 */
export interface IKnowledgeDocumentTask extends IBasePerTenantAndOrganizationEntityModel {
  documentId?: string
  document?: IKnowledgeDocument
  knowledgebaseId?: string
  knowledgebase?: IKnowledgebase

  taskType: string; // preprocess / re-embed / cleanup ...
  status?: 'pending' | 'running' | 'success' | 'failed' | 'cancelled';
  steps: TaskStep[];
  error?: string;
}

export interface TaskStep {
  name: string;               // step name: load, preprocess, split, embed, store
  status: 'pending' | 'running' | 'success' | 'failed';
  progress: number;           // 0 - 100
  log?: string;               // optional logs
  error_message?: string;     // optional error
  started_at?: Date;
  finished_at?: Date;
}