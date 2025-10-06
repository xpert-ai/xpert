import { IBasePerTenantAndOrganizationEntityModel } from '../base-entity.model'
import { IChatConversation } from './chat.model';
import { IKnowledgeDocument } from './knowledge-doc.model';
import { IKnowledgebase } from './knowledgebase.model'

/**
 * Task executions of a knowledgebase
 */
export interface IKnowledgebaseTask extends IBasePerTenantAndOrganizationEntityModel {
  knowledgebaseId?: string
  knowledgebase?: IKnowledgebase

  conversationId?: string;
  conversation?: IChatConversation

  taskType: string; // preprocess / re-embed / cleanup ...
  status?: 'pending' | 'running' | 'success' | 'failed' | 'cancelled';
  steps: TaskStep[];
  error?: string;

  /**
   * Temporary content: Documents not actually processed in the task yet
   */
  context?: {
		documents?: Partial<IKnowledgeDocument>[]
	}

  /**
   * Many to Many of documents in task
   */
  documents?: IKnowledgeDocument[]
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