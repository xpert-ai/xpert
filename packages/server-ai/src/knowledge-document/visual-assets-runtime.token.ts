import type { AgentMiddlewareRuntimeScope, KnowledgeDocumentVisualAssetsApi } from '@xpert-ai/plugin-sdk'

export const KNOWLEDGE_DOCUMENT_VISUAL_ASSETS_RUNTIME = Symbol.for(
    'xpert.platform.knowledge-document-visual-assets-runtime'
)

export interface KnowledgeDocumentVisualAssetsRuntimeFactory {
    createScopedApi(scope: AgentMiddlewareRuntimeScope): KnowledgeDocumentVisualAssetsApi
}
