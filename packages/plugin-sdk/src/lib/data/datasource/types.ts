/**
 * The base options for DB adapters
 */
export interface AdapterBaseOptions {
  /**
   * Ref to debug in `createConnection` of `mysql`
   */
  debug?: boolean
  /**
   * Ref to trace in `createConnection` of `mysql`
   */
  trace?: boolean
  host: string
  port: number
  username: string
  password: string
}