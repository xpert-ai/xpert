import { KnowledgebaseClearHandler } from './knowledge.clear.handler'
import { PluginPermissionsHandler } from './plugin-permissions.handler'
import { WriteAgentKnowledgeChunkHandler } from './write-agent-knowledge-chunk.handler'

export const CommandHandlers = [
    KnowledgebaseClearHandler,
    PluginPermissionsHandler,
    WriteAgentKnowledgeChunkHandler
]
