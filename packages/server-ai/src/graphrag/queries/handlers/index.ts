import { KnowledgeGraphNodeDetailHandler } from './node-detail.handler'
import { KnowledgeGraphSearchHandler } from './search.handler'
import { KnowledgeGraphEntitySearchHandler } from './entity-search.handler'
import { KnowledgeGraphViewHandler } from './view.handler'

export const QueryHandlers = [
    KnowledgeGraphSearchHandler,
    KnowledgeGraphEntitySearchHandler,
    KnowledgeGraphNodeDetailHandler,
    KnowledgeGraphViewHandler
]
