import { IStorageFile } from '@xpert-ai/contracts'
import { ForbiddenException, Injectable } from '@nestjs/common'
import { QueryBus } from '@nestjs/cqrs'
import {
    AgentMiddlewareFileReference,
    AgentMiddlewareResolvedFile,
    type AgentMiddlewareFileApi,
    FileRuntimeCapability
} from '@xpert-ai/plugin-sdk'
import { FileStorage } from '@xpert-ai/server-core'
import type { FileAsset } from '../entities/file-asset.entity'
import type { FileAssetAuthority, FileAssetLocator } from '../file-asset-access.service'
import { GetOwnedStorageFileQuery } from '../queries/get-owned-storage-file.query'
import { ResolveAuthorizedFileAssetQuery } from '../queries/resolve-authorized-file-asset.query'
import { normalizeOptionalString } from '../../shared/runtime/runtime-input'
import { RuntimeCapabilityProvider } from '../../shared/runtime/runtime-capability-provider.decorator'

export type FileRuntimeDefaults = { conversationId?: string | null }

// Platform calls use the current owner; Agent calls bind the conversation once.
// Never persist a conversation identity on the shared provider instance.
@Injectable()
@RuntimeCapabilityProvider(FileRuntimeCapability)
export class FileRuntimeService implements AgentMiddlewareFileApi {
    constructor(private readonly queryBus: QueryBus) {}

    resolveFile(input: AgentMiddlewareFileReference): Promise<AgentMiddlewareResolvedFile | null> {
        return this.resolveFileWithScope(input, {})
    }

    createScopedApi(defaults: FileRuntimeDefaults): AgentMiddlewareFileApi {
        const scope = { conversationId: normalizeOptionalString(defaults.conversationId) }
        return { resolveFile: (input) => this.resolveFileWithScope(input, scope) }
    }

    private async resolveFileWithScope(
        input: AgentMiddlewareFileReference,
        scope: FileRuntimeDefaults
    ): Promise<AgentMiddlewareResolvedFile | null> {
        const directUrl =
            normalizeOptionalString(input.previewUrl) ??
            normalizeOptionalString(input.fileUrl) ??
            normalizeOptionalString(input.url)
        const explicitFileAssetId = normalizeOptionalString(input.fileAssetId) ?? normalizeOptionalString(input.fileId)
        const requestedStorageFileId = normalizeOptionalString(input.storageFileId)
        const bareId = normalizeOptionalString(input.id)
        const fileAssetId = explicitFileAssetId ?? (!requestedStorageFileId ? bareId : undefined)
        const legacyStorageFileId = requestedStorageFileId ?? (!explicitFileAssetId ? bareId : undefined)
        let storageFileId = requestedStorageFileId
        let fileAsset: FileAsset | null = null
        let storageFile: IStorageFile | null = null

        if (fileAssetId || storageFileId) {
            let locator: FileAssetLocator
            if (fileAssetId) {
                locator = { fileAssetId, ...(requestedStorageFileId ? { storageFileId: requestedStorageFileId } : {}) }
            } else {
                locator = { storageFileId }
            }
            try {
                const authorized = await this.queryBus.execute(
                    new ResolveAuthorizedFileAssetQuery({
                        locator,
                        authority: this.resolveFileAssetAuthority(scope),
                        operation: 'read'
                    })
                )
                fileAsset = authorized.asset
                storageFile = authorized.storageFile ?? null
                storageFileId = normalizeOptionalString(storageFile?.id)
            } catch (error) {
                if (!(error instanceof ForbiddenException) || explicitFileAssetId || !legacyStorageFileId) {
                    throw error
                }
                storageFile = await this.queryBus.execute(new GetOwnedStorageFileQuery(legacyStorageFileId))
                storageFileId = normalizeOptionalString(storageFile?.id)
            }
        }

        const url = storageFile ? this.resolveStorageFileUrl(storageFile) : directUrl
        if (!url) {
            return null
        }

        const name =
            normalizeOptionalString(fileAsset?.originalName) ??
            normalizeOptionalString(fileAsset?.fileName) ??
            normalizeOptionalString(storageFile?.originalName) ??
            normalizeOptionalString(input.name) ??
            normalizeOptionalString(input.originalName) ??
            'source-document'
        const mimeType =
            normalizeOptionalString(fileAsset?.mimeType) ??
            normalizeOptionalString(storageFile?.mimetype) ??
            normalizeOptionalString(input.mimeType) ??
            normalizeOptionalString(input.mimetype)
        const size =
            typeof fileAsset?.size === 'number'
                ? fileAsset.size
                : typeof storageFile?.size === 'number'
                  ? storageFile.size
                  : typeof input.size === 'number'
                    ? input.size
                    : undefined

        return {
            id: fileAsset?.id ?? storageFileId ?? url,
            ...(fileAsset ? { fileId: fileAsset.id, fileAssetId: fileAsset.id } : {}),
            ...(storageFileId ? { storageFileId } : {}),
            name,
            ...(mimeType ? { mimeType } : {}),
            ...(typeof size === 'number' ? { size } : {}),
            url,
            previewUrl: url
        }
    }

    private resolveStorageFileUrl(storageFile: IStorageFile | null) {
        if (!storageFile) {
            return undefined
        }

        const directUrl = normalizeOptionalString(storageFile.fileUrl) ?? normalizeOptionalString(storageFile.url)
        if (directUrl) {
            return directUrl
        }

        const file = normalizeOptionalString(storageFile.file)
        if (!file) {
            return undefined
        }

        return new FileStorage().getProvider(storageFile.storageProvider)?.url(file)
    }

    private resolveFileAssetAuthority(scope: FileRuntimeDefaults): FileAssetAuthority {
        const conversationId = normalizeOptionalString(scope.conversationId)
        return conversationId ? { kind: 'conversation', conversationId } : { kind: 'current-owner' }
    }
}
