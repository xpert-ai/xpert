import { KnowledgebaseGetOneHandler } from './get-one.handler'
import { KnowledgeSearchQueryHandler } from './knowledge-search.handler'
import { ListWorkspaceKnowledgebasesHandler } from './list-workspace-knowledgebases.handler'
import { StatisticsKnowledgebasesHandler } from './statistics-knowledgebases.handler'
import { KnowledgeStrategyHandler } from './strategy.handler'
import { KnowledgeTaskServiceHandler } from './task-service.handler'

export const QueryHandlers = [
    KnowledgeSearchQueryHandler,
    KnowledgebaseGetOneHandler,
    ListWorkspaceKnowledgebasesHandler,
    StatisticsKnowledgebasesHandler,
    KnowledgeStrategyHandler,
    KnowledgeTaskServiceHandler
]
