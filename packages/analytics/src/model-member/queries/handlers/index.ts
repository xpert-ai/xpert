import { DimensionMemberServiceHandler } from './m-member-service.handler'
import { DimensionMemberRetrieverToolHandler } from './retriever-tool.handler'
import { DimensionMemberRetrieverHandler } from './retriever.handler'

export const QueryHandlers = [
    DimensionMemberRetrieverHandler,
    DimensionMemberRetrieverToolHandler,
    DimensionMemberServiceHandler
]
