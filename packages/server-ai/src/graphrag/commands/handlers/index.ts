import { KnowledgeGraphClearDocumentHandler } from './clear-document.handler'
import { KnowledgeGraphEnqueueHandler } from './enqueue.handler'
import { KnowledgeGraphRetryDocumentHandler } from './retry-document.handler'

export const CommandHandlers = [
    KnowledgeGraphClearDocumentHandler,
    KnowledgeGraphEnqueueHandler,
    KnowledgeGraphRetryDocumentHandler
]
