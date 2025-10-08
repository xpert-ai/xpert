import { IBasePerTenantAndOrganizationEntityModel } from '../base-entity.model'
import { IIndicator } from './indicator'
import { ISemanticModel } from './semantic-model'

export type TQueryOptions = {
  rows?: any
  columns?: any
  cube?: string
  /**
   * Indicators modified by the client
   */
  indicators?: IIndicator[]
  calculatedMeasures?: any[] // CalculatedProperty[]
} & Record<string, any>

export enum QueryStatusEnum {
  PENDING = 'pending', // Query submitted, waiting for execution
  RUNNING = 'running', // Query is executing
  SUCCESS = 'success', // Query succeeded
  FAILED = 'failed',   // Query failed
}


export interface ISemanticModelQueryLog extends IBasePerTenantAndOrganizationEntityModel {
  /**
   * Unique ID of the client query
   */
  key?: string
  modelId: string
  model?: ISemanticModel
  cube?: string
  status: QueryStatusEnum
  /**
   * Structural parameters for query
   */
  params: TQueryOptions
  /**
   * Statement of query
   */
  query?: string
  result: any
  executionTime: number; // Execution time (milliseconds)
  waitingTime: number; // Query waiting time (milliseconds)
  error?: string
}
