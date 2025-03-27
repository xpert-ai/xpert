import { TQueryOptions } from "@metad/contracts"

export const QUERY_QUEUE_NAME = 'model-query-queue'

export type TGatewayQuery = {
    id, 
    organizationId, 
    dataSourceId, 
    modelId, 
    body: {
        /**
         * @deprecated use statement
         */
        mdx?: string
        statement?: string
        query?: TQueryOptions
    }
    acceptLanguage, 
    forceRefresh
}