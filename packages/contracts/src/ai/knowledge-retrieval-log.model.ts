import { IBasePerTenantAndOrganizationEntityModel } from '../base-entity.model'
import { IKnowledgebase } from './knowledgebase.model'
import { KnowledgeFilterDiagnostics, KnowledgeFilterNode, KnowledgeFilterStatus } from './knowledge-filter.model'

export interface IKnowledgeRetrievalLog extends IBasePerTenantAndOrganizationEntityModel {
  // 检索触发的查询内容
  query: string
  // 检索来源，比如：AI Assistant、Knowledge Tool、API
  source: string

  // 命中分段数
  hitCount: number

  // 请求 ID（用于一次对话追踪）
  requestId: string

  filterVersion?: number
  fixedFilter?: KnowledgeFilterNode
  dynamicFilter?: KnowledgeFilterNode
  requestFilter?: KnowledgeFilterNode
  effectiveFilter?: KnowledgeFilterNode
  filterHash?: string
  filterStatus?: KnowledgeFilterStatus
  fallbackReason?: string
  errorCode?: string
  candidateDocumentCount?: number
  candidateChunkCount?: number
  vectorBackend?: string
  filterLatency?: number
  vectorLatency?: number
  diagnostics?: KnowledgeFilterDiagnostics

  knowledgebaseId?: string
  // 与知识库关联
  knowledgebase?: IKnowledgebase
}
