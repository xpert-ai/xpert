import { KnowledgebaseGetOneHandler } from './get-one.handler'
import { KnowledgeSearchQueryHandler } from './knowledge-search.handler'
import { KnowledgeFolderOptionsHandler } from './knowledge-folder-options.handler'
import { KnowledgeFilterValueOptionsHandler } from './knowledge-filter-options.handler'
import { KnowledgeGraphExploreHandler } from './knowledge-graph-explore.handler'
import { ListWorkspaceKnowledgebasesHandler } from './list-workspace-knowledgebases.handler'
import { StatisticsKnowledgebasesHandler } from './statistics-knowledgebases.handler'
import { KnowledgeStrategyHandler } from './strategy.handler'
import { KnowledgeTaskServiceHandler } from './task-service.handler'

export const QueryHandlers = [
    KnowledgeSearchQueryHandler,
    KnowledgeFolderOptionsHandler,
    KnowledgeFilterValueOptionsHandler,
    KnowledgeGraphExploreHandler,
    KnowledgebaseGetOneHandler,
    ListWorkspaceKnowledgebasesHandler,
    StatisticsKnowledgebasesHandler,
    KnowledgeStrategyHandler,
    KnowledgeTaskServiceHandler
]
