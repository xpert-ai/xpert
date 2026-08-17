export * from './constants'
export * from './knowledgebase-tools.middleware'

import { KnowledgebaseToolsMiddleware } from './knowledgebase-tools.middleware'

export const KnowledgebaseToolsProviders = [KnowledgebaseToolsMiddleware]
