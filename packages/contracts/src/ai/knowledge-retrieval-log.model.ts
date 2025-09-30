import { IBasePerTenantAndOrganizationEntityModel } from "../base-entity.model"
import { IKnowledgebase } from "./knowledgebase.model"

export interface IKnowledgeRetrievalLog extends IBasePerTenantAndOrganizationEntityModel {
  // 检索触发的查询内容
  query: string
  // 检索来源，比如：ChatBI、ChatDB、API
  source: string;

  // 命中分段数
  hitCount: number;

  // 请求 ID（用于一次对话追踪）
  requestId: string;
  
  knowledgebaseId?: string
   // 与知识库关联
  knowledgebase?: IKnowledgebase
}