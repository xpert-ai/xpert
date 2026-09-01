import { DeleteAgentKnowledgeChunksHandler } from './delete-agent-knowledge-chunks.handler'
import { KnowledgebaseClearHandler } from './knowledge.clear.handler'
import {
    CreateKnowledgebaseFolderHandler,
    CreateKnowledgebaseDocumentsHandler,
    DeleteKnowledgebaseDocumentsHandler,
    GetKnowledgebaseDocumentStatusHandler,
    ImportKnowledgebaseArchiveHandler,
    ListKnowledgebaseDocumentsHandler,
    MoveKnowledgebaseDocumentHandler,
    ReadKnowledgebaseDocumentImageHandler,
    ReprocessKnowledgebaseDocumentsHandler,
    StartKnowledgebaseDocumentsProcessingHandler,
    UploadKnowledgebaseDocumentFileHandler
} from './knowledgebase-documents.handler'
import { PluginPermissionsHandler } from './plugin-permissions.handler'
import { WriteAgentKnowledgeChunkHandler } from './write-agent-knowledge-chunk.handler'
import { EnsureKnowledgebasesHandler } from './ensure-knowledgebases.handler'

export const CommandHandlers = [
    EnsureKnowledgebasesHandler,
    CreateKnowledgebaseDocumentsHandler,
    CreateKnowledgebaseFolderHandler,
    DeleteAgentKnowledgeChunksHandler,
    DeleteKnowledgebaseDocumentsHandler,
    GetKnowledgebaseDocumentStatusHandler,
    ImportKnowledgebaseArchiveHandler,
    ListKnowledgebaseDocumentsHandler,
    MoveKnowledgebaseDocumentHandler,
    ReadKnowledgebaseDocumentImageHandler,
    ReprocessKnowledgebaseDocumentsHandler,
    KnowledgebaseClearHandler,
    PluginPermissionsHandler,
    StartKnowledgebaseDocumentsProcessingHandler,
    UploadKnowledgebaseDocumentFileHandler,
    WriteAgentKnowledgeChunkHandler
]
