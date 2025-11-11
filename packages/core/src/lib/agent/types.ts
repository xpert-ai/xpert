import { Observable } from 'rxjs'
import { DataSourceOptions } from '../data-source'
import { HttpHeaders } from '../types'

export enum AgentType {
  Local = 'local',
  Browser = 'browser',
  Server = 'server',
  Wasm = 'wasm'
}

export interface AgentStatus {
  status: AgentStatusEnum,
  payload?: any
}

/**
 * Forward the request, do not parse the request content.
 */
export interface Agent {
  type: AgentType
  selectStatus(): Observable<AgentStatus | AgentStatusEnum>
  selectError(): Observable<any>
  error(err: any): void
  request(dataSource: DataSourceOptions, options: any): Promise<any>
  /**
   * New API
   * @param dataSource 
   * @param options 
   */
  _request?(dataSource: DataSourceOptions, options: any): Observable<any>
}

export enum AgentStatusEnum {
  Initializing = 'Initializing',
  OFFLINE = 'offline',
  ONLINE = 'online',
  LOADING = 'loading',
  ERROR = 'error'
}

export interface AgentRequestOptions {
  method?: string
  url?: string
  body?: string | string[] | Record<string, unknown>
  headers?: HttpHeaders
  /**
   * Table schema
   */
  catalog?: string
  /**
   * Table name
   */
  table?: string
}

export interface OcapCache {
  keys(): Promise<string[]>
  clear(key: string): Promise<void>
  clearAllCache(): void
  changeCacheLevel(level: number): void
  getCacheLevel(): number
  getCache<T>(options: OcapCacheOptions, ...params): Promise<T>
  setCache(options: OcapCacheOptions, data: unknown, ...params): void
}

export interface OcapCacheOptions {
  key: string;
  maxAge: number
  level: number
  version: string
}