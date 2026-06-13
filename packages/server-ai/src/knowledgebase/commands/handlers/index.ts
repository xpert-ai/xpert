import { DeleteAgentKnowledgeChunksHandler } from './delete-agent-knowledge-chunks.handler'
import { KnowledgebaseClearHandler } from './knowledge.clear.handler'
import {
    CreateKnowledgebaseDocumentsHandler,
    DeleteKnowledgebaseDocumentsHandler,
    GetKnowledgebaseDocumentStatusHandler,
    ImportKnowledgebaseArchiveHandler,
    StartKnowledgebaseDocumentsProcessingHandler,
    UploadKnowledgebaseDocumentFileHandler
} from './knowledgebase-documents.handler'
import { PluginPermissionsHandler } from './plugin-permissions.handler'
import { WriteAgentKnowledgeChunkHandler } from './write-agent-knowledge-chunk.handler'

export const CommandHandlers = [
    CreateKnowledgebaseDocumentsHandler,
    DeleteAgentKnowledgeChunksHandler,
    DeleteKnowledgebaseDocumentsHandler,
    GetKnowledgebaseDocumentStatusHandler,
    ImportKnowledgebaseArchiveHandler,
    KnowledgebaseClearHandler,
    PluginPermissionsHandler,
    StartKnowledgebaseDocumentsProcessingHandler,
    UploadKnowledgebaseDocumentFileHandler,
    WriteAgentKnowledgeChunkHandler
]
