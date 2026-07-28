import { IDataSource, ISemanticModel } from '@xpert-ai/contracts'
import { Observable } from 'rxjs'

export type UUID = string

export enum DataSourceAgentType {
  Browser = 'browser',
  Server = 'server'
}

export enum DataSourceAgentStatusEnum {
  Initializing = 'Initializing',
  OFFLINE = 'offline',
  ONLINE = 'online',
  LOADING = 'loading',
  ERROR = 'error'
}

export interface DataSourceAgentStatus {
  status: DataSourceAgentStatusEnum
  payload?: unknown
}

export interface DataSourceAgentRequestOptions {
  method?: string
  url?: string
  body?: string | string[] | Record<string, unknown>
  headers?: Record<string, string>
  catalog?: string
  table?: string
  forceRefresh?: boolean
  [key: string]: unknown
}

export type DataSourceAgentOptions = ISemanticModel & {
  dataSource?: IDataSource
  isDraft?: boolean
  settings?: Record<string, unknown>
  parameters?: Record<string, Record<string, unknown>>
}

export interface DataSourceAgent {
  type: DataSourceAgentType
  selectStatus(): Observable<DataSourceAgentStatus | DataSourceAgentStatusEnum>
  selectError(): Observable<unknown>
  error(error: unknown): void
  request(dataSource: DataSourceAgentOptions, options: DataSourceAgentRequestOptions): Promise<unknown>
  _request?(dataSource: DataSourceAgentOptions, options: DataSourceAgentRequestOptions): Observable<unknown>
}
