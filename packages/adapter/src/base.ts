import * as _axios from 'axios'
import { AdapterBaseOptions } from './types'
import { DBQueryRunner, DBQueryRunnerType, BaseQueryRunner } from '@xpert-ai/plugin-sdk'

export { BaseQueryRunner, BaseSQLQueryRunner } from '@xpert-ai/plugin-sdk'

const axios = _axios.default

export const QUERY_RUNNERS: Record<
  string,
  DBQueryRunnerType
> = {}

export interface HttpAdapterOptions extends AdapterBaseOptions {
  url?: string
}

export abstract class BaseHTTPQueryRunner<T extends HttpAdapterOptions = HttpAdapterOptions> extends BaseQueryRunner<T> {
  get url(): string {
    return this.options?.url as string
  }
  get host() {
    if (this.options?.host) {
      return this.options.host as string
    }
    return new URL(this.options?.url as string).hostname
  }

  get port(): number | string {
    if (this.options?.port) {
      return Number(this.options.port)
    }
    return new URL(this.options?.url as string).port
  }

  get configurationSchema() {
    return {}
  }

  get() {
    return axios.get(this.url)
  }

  post(data, options?: any) {
    return axios.post(this.url, data, options)
  }

  abstract runQuery(query: string, options: any): Promise<any>
}

/**
 * Adapter options for sql db
 */
export interface SQLAdapterOptions extends AdapterBaseOptions {
  url?: string
  /**
   * Database name, used as catalog
   */
  catalog?: string

  use_ssl?: boolean
  ssl_cacert?: string
  version?: number
}

/**
 * Register adapter class by `type`
 * 
 * @param type 
 * @param query_runner_class 
 */
export function register<T extends AdapterBaseOptions = AdapterBaseOptions>(
  type: string,
  query_runner_class: new (options?: T, ...args: unknown[]) => DBQueryRunner
) {
  if (QUERY_RUNNERS[type]) {
    throw new Error(`DB adapter type ${type} already existed!`)
  }
  QUERY_RUNNERS[type] = query_runner_class as DBQueryRunnerType
}

/**
 * @deprecated use `createAdapterByType`
 */
export function createQueryRunnerByType1(type: string, options: AdapterBaseOptions) {
  if (QUERY_RUNNERS[type]) {
    return new QUERY_RUNNERS[type](options)
  }

  return null
}
