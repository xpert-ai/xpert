export * from './constants'
export * from './knowledge-workbench.middleware'
export * from './knowledge-workbench.service'
export * from './knowledge-workbench-view.provider'

import { KnowledgeWorkbenchMiddleware } from './knowledge-workbench.middleware'
import { KnowledgeWorkbenchService } from './knowledge-workbench.service'
import { KnowledgeWorkbenchViewProvider } from './knowledge-workbench-view.provider'

export const KnowledgeWorkbenchProviders = [
    KnowledgeWorkbenchService,
    KnowledgeWorkbenchMiddleware,
    KnowledgeWorkbenchViewProvider
]
