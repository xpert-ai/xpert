import { IBasePerTenantAndOrganizationEntityModel } from '../base-entity.model'
import { ISemanticModel } from './semantic-model'

export type TQueryOptions = {
  rows?: any
  columns?: any
  cube?: string
} & Record<string, any>

export enum QueryStatusEnum {
  PENDING = 'pending', // 查询已提交，等待执行
  RUNNING = 'running', // 查询正在执行
  SUCCESS = 'success', // 查询成功
  FAILED = 'failed',   // 查询失败
}


export interface ISemanticModelQueryLog extends IBasePerTenantAndOrganizationEntityModel {
  modelId: string
  model?: ISemanticModel
  cube?: string
  status: QueryStatusEnum
  params: TQueryOptions
  query?: string
  result: any
  executionTime: number; // 执行时间（毫秒）
  waitingTime: number; // 查询等待时间（毫秒）
  error?: string
}
