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
  }
  acceptLanguage?: string
  forceRefresh: boolean
}
