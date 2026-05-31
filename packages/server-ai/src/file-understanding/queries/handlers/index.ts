import { GetFileAssetByStorageFileHandler } from './get-file-asset-by-storage-file.handler'
import { GetFileAssetHandler } from './get-file-asset.handler'
import { GetFileParseStatusHandler } from './get-file-parse-status.handler'
import { GetFilePreviewHandler } from './get-file-preview.handler'
import { GetFileWorkspacePathHandler } from './get-file-workspace-path.handler'
import { ListConversationFilesHandler } from './list-conversation-files.handler'
import { ListFilePageImagesHandler } from './list-file-page-images.handler'
import { ReadFileChunkHandler } from './read-file-chunk.handler'
import { SearchFileChunksHandler } from './search-file-chunks.handler'

export const QueryHandlers = [
    GetFileAssetByStorageFileHandler,
    GetFileAssetHandler,
    GetFileParseStatusHandler,
    GetFilePreviewHandler,
    GetFileWorkspacePathHandler,
    ListConversationFilesHandler,
    ListFilePageImagesHandler,
    ReadFileChunkHandler,
    SearchFileChunksHandler
]
