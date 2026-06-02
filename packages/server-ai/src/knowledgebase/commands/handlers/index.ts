import { DeleteAgentKnowledgeChunksHandler } from './delete-agent-knowledge-chunks.handler'
import { KnowledgebaseClearHandler } from './knowledge.clear.handler'
import { PluginPermissionsHandler } from './plugin-permissions.handler'
import { WriteAgentKnowledgeChunkHandler } from './write-agent-knowledge-chunk.handler'

export const CommandHandlers = [
    DeleteAgentKnowledgeChunksHandler,
    KnowledgebaseClearHandler,
    PluginPermissionsHandler,
    WriteAgentKnowledgeChunkHandler
]
