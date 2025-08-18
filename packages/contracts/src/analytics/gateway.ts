import { TQueryOptions } from './model-query-log.model'

export type TGatewayQueryEvent = {
  id: string
  organizationId: string
  dataSourceId: string
  modelId?: string
  isDraft: boolean
  body: {
    /**
     * @deprecated use statement
     */
    mdx?: string
    statement?: string
    query?: TQueryOptions
    /**
     * Is use indicators draft, corresponding to `DataSourceOptions['isIndicatorsDraft']` in the ocap framework.
     */
    isIndicatorsDraft?: boolean
  }
  acceptLanguage?: string
  forceRefresh: boolean
}

export type TGatewayRespEvent = any

export type TGatewayRespError = {
  message: string
  status: number
}