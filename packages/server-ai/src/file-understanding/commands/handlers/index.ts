import { AttachFileToConversationHandler } from './attach-file-to-conversation.handler'
import { CreateFileArtifactsHandler } from './create-file-artifacts.handler'
import { CreateFileAssetHandler } from './create-file-asset.handler'
import { CreateWorkspaceFileAssetHandler } from './create-workspace-file-asset.handler'
import { DeleteFileAssetHandler } from './delete-file-asset.handler'
import { EnqueueFileParseHandler } from './enqueue-file-parse.handler'
import { IndexFileChunksHandler } from './index-file-chunks.handler'
import { ParseFileAssetHandler } from './parse-file-asset.handler'
import { RetryFileParseHandler } from './retry-file-parse.handler'

export const CommandHandlers = [
    AttachFileToConversationHandler,
    CreateFileArtifactsHandler,
    CreateFileAssetHandler,
    CreateWorkspaceFileAssetHandler,
    DeleteFileAssetHandler,
    EnqueueFileParseHandler,
    IndexFileChunksHandler,
    ParseFileAssetHandler,
    RetryFileParseHandler
]
