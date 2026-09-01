import { AssertFileUploadScopeHandler } from './assert-file-upload-scope.handler'
import { GetFileAssetByStorageFileHandler } from './get-file-asset-by-storage-file.handler'
import { GetFileAssetHandler } from './get-file-asset.handler'
import { GetOwnedStorageFileHandler } from './get-owned-storage-file.handler'
import { GetFileParseStatusHandler } from './get-file-parse-status.handler'
import { GetFileUnderstandingStatusHandler } from './get-file-understanding-status.handler'
import { GetFilePreviewHandler } from './get-file-preview.handler'
import { GetFileWorkspacePathHandler } from './get-file-workspace-path.handler'
import { ListConversationFilesHandler } from './list-conversation-files.handler'
import { ListProjectFilesHandler } from './list-project-files.handler'
import { ListFilePageImagesHandler } from './list-file-page-images.handler'
import { ReadFileChunkHandler } from './read-file-chunk.handler'
import { ReadFileAssetSourceHandler } from './read-file-asset-source.handler'
import { ResolveAuthorizedFileAssetHandler } from './resolve-authorized-file-asset.handler'
import { SearchFileChunksHandler } from './search-file-chunks.handler'
import { ValidateFileUnderstandingReferencesHandler } from './validate-file-understanding-references.handler'

export const QueryHandlers = [
    AssertFileUploadScopeHandler,
    GetFileAssetByStorageFileHandler,
    GetFileAssetHandler,
    GetOwnedStorageFileHandler,
    GetFileParseStatusHandler,
    GetFileUnderstandingStatusHandler,
    GetFilePreviewHandler,
    GetFileWorkspacePathHandler,
    ListConversationFilesHandler,
    ListProjectFilesHandler,
    ListFilePageImagesHandler,
    ReadFileAssetSourceHandler,
    ResolveAuthorizedFileAssetHandler,
    ReadFileChunkHandler,
    SearchFileChunksHandler,
    ValidateFileUnderstandingReferencesHandler
]
