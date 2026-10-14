import {
    normalizeOptionalString,
    toWorkspaceRuntimeDescriptor,
    readRuntimeFilePath,
    readRuntimeScope,
    normalizeVolumeRelativeFilePath,
    normalizeRuntimeWorkspaceFilePath,
    toRuntimeWorkspacePath,
    normalizeUploadFolder,
    resolveWorkspaceVolumeScopeError
} from './workspace-files-runtime-paths'
import { applyRuntimeScopeDefaults, normalizeRequiredWorkspaceFilePath } from './workspace-files-runtime-scope'
import {
    BadRequestException,
    ForbiddenException,
    Inject,
    Injectable,
    InternalServerErrorException,
    Optional
} from '@nestjs/common'
import { CommandBus, QueryBus } from '@nestjs/cqrs'
import { realpath, stat } from 'node:fs/promises'
import path from 'node:path'
import {
    RequestContext,
    WorkspaceAppDataOptions,
    WorkspaceStorage,
    ProjectAccessRuntimeCapability,
    WorkspaceFile,
    WorkspaceFileBuffer,
    WorkspaceFileLocator,
    WorkspaceFileScope,
    WorkspacePortableFileReference,
    WorkspaceRuntimeFileBuffer,
    WorkspaceRuntimeWriteInput,
    WorkspaceFileReference,
    WorkspaceFilesApi,
    WorkspaceFilesRuntimeCapability,
    WorkspaceUnderstandFileInput,
    WorkspaceUnderstoodFile,
    WorkspaceUploadBufferInput,
    WorkspaceUnderstandingStatus,
    WorkspaceUnderstandingStatusInput,
    WorkspaceRetryUnderstandingInput,
    WorkspaceListUnderstandingChunksInput,
    WorkspaceSearchUnderstandingChunksInput,
    WorkspaceUnderstandingChunk,
    WorkspaceUnderstandingChunkPage,
    WorkspaceValidateUnderstandingReferencesInput,
    WorkspaceValidatedUnderstandingReference,
    type RuntimeCapabilityResolver,
    XPERT_RUNTIME_CAPABILITIES_TOKEN
} from '@xpert-ai/plugin-sdk'
import { getFileAssetDestination, UploadFileCommand } from '@xpert-ai/server-core'
import { t } from 'i18next'
import { CreateWorkspaceFileAssetCommand } from '../../file-understanding/commands/create-workspace-file-asset.command'
import { EnqueueFileParseCommand } from '../../file-understanding/commands/enqueue-file-parse.command'
import {
    isWorkspaceFileCatalog,
    resolveFileAssetWorkspaceRelativePath,
    resolveFileAssetWorkspaceVolumeScope,
    resolveWorkspaceVolumeScope,
    type WorkspaceVolumeScopeResolution
} from '../../file-understanding/domain/workspace-file'
import type { FileAsset } from '../../file-understanding/entities/file-asset.entity'
import type { FileChunk } from '../../file-understanding/entities/file-chunk.entity'
import type {
    FileAssetAuthority,
    FileAssetLocator,
    FileAssetOperation
} from '../../file-understanding/file-asset-access.service'
import { GetFileUnderstandingStatusQuery } from '../../file-understanding/queries/get-file-understanding-status.query'
import { ResolveAuthorizedFileAssetQuery } from '../../file-understanding/queries/resolve-authorized-file-asset.query'
import { SearchFileChunksQuery } from '../../file-understanding/queries/search-file-chunks.query'
import { ValidateFileUnderstandingReferencesQuery } from '../../file-understanding/queries/validate-file-understanding-references.query'
import { isProjectGovernedContentPath, VOLUME_CLIENT, VolumeClient, VolumeSubtreeClient } from '../volume'

import { createWorkspaceAppData, authorizeAssistantWorkspace } from './workspace-files-app-data'
import { assertPublicWorkspacePath } from '../volume/workspace-managed-path'
import { RuntimeCapabilityProvider } from './runtime-capability-provider.decorator'

const WORKSPACE_FILES_SOURCE = 'platform.workspace.files'
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

/**
 * Runtime workspace defaults captured from the current Agent execution.
 *
 * These values let plugin code pass simple paths while the platform supplies
 * tenant, user, project/Xpert scope, and sandbox workspace root information.
 */
export type WorkspaceFilesRuntimeDefaults = WorkspaceFileScope & {
    conversationId?: string | null
    workspaceRoot?: string | null
    workspacePath?: string | null
}

/**
 * Internal, server-only source evidence used by Sandbox Jobs when a system
 * Runtime Provider supports read-only seekable inputs.
 */
export type WorkspaceReadOnlyFileSource = {
    serverPath: string
    hostPath: string
    size: number
    mtimeMs: number
    device: number
    inode: number
}

@Injectable()
@RuntimeCapabilityProvider(WorkspaceFilesRuntimeCapability)
export class WorkspaceFilesRuntimeCapabilityService implements WorkspaceFilesApi {
    readonly api: WorkspaceFilesApi = this

    constructor(
        @Inject(CommandBus)
        private readonly commandBus: Pick<CommandBus, 'execute'>,
        @Inject(VOLUME_CLIENT)
        private readonly volumeClient: Pick<VolumeClient, 'resolve'>,
        @Inject(XPERT_RUNTIME_CAPABILITIES_TOKEN)
        private readonly capabilities: RuntimeCapabilityResolver,
        @Optional()
        @Inject(QueryBus)
        private readonly queryBus?: Pick<QueryBus, 'execute'>
    ) {}

    /**
     * Create a workspace-files facade bound to one Agent runtime scope.
     *
     * Middleware tools receive this scoped API so `/workspace/foo` can be read
     * without exposing catalog, scopeId, tenantId, or projectId to the Agent.
     */
    createScopedApi(defaults: WorkspaceFilesRuntimeDefaults): WorkspaceFilesApi {
        defaults = Object.freeze({ ...defaults })
        const binding = applyRuntimeScopeDefaults<WorkspaceFileScope>({}, defaults)
        return {
            appData: (options) =>
                createWorkspaceAppData(defaults, options, this.commandBus, this.volumeClient, this.requireQueryBus()),
            scope: Object.freeze({
                tenantId: binding.tenantId,
                organizationId: binding.organizationId,
                userId: binding.userId,
                catalog: binding.catalog,
                scopeId: binding.scopeId,
                projectId: binding.projectId,
                xpertId: binding.xpertId,
                isolateByUser: binding.isolateByUser
            }),
            uploadBuffer: async (input) => this.uploadBuffer(await this.applyFileDefaults(input, defaults)),
            understandFile: async (input) => this.understandFile(await this.applyFileDefaults(input, defaults)),
            getUnderstandingStatus: async (input) =>
                this.getUnderstandingStatus(await this.applyFileDefaults(input, defaults)),
            retryUnderstanding: async (input) => this.retryUnderstanding(await this.applyFileDefaults(input, defaults)),
            validateUnderstandingReferences: async (input) =>
                this.validateUnderstandingReferences(await this.applyFileDefaults(input, defaults)),
            listUnderstandingChunks: async (input) =>
                this.listUnderstandingChunks(await this.applyFileDefaults(input, defaults)),
            searchUnderstandingChunks: async (input) =>
                this.searchUnderstandingChunks(await this.applyFileDefaults(input, defaults)),
            resolveFile: async (input) => this.resolveFile(await this.applyFileDefaults(input, defaults)),
            readBuffer: async (input) => this.readBuffer(await this.applyFileDefaults(input, defaults)),
            deleteFile: async (input) => this.deleteFile(await this.applyFileDefaults(input, defaults)),
            resolveRuntimeReference: async (input) => this.resolveRuntimeReferenceWithDefaults(input, defaults),
            readRuntimeBuffer: async (input) => this.readRuntimeBufferWithDefaults(input, defaults),
            writeRuntimeBuffer: async (input) => this.writeRuntimeBufferWithDefaults(input, defaults)
        }
    }

    private async applyFileDefaults<T extends WorkspaceFileScope>(
        input: T,
        defaults: WorkspaceFilesRuntimeDefaults
    ): Promise<T> {
        if (
            input.userId &&
            defaults.userId &&
            input.userId !== defaults.userId &&
            defaults.xpertId &&
            !defaults.projectId
        ) {
            const scope = await authorizeAssistantWorkspace(defaults, 'read', this.commandBus)
            if (scope.catalog === 'user-xperts' && input.userId === scope.userId) {
                return applyRuntimeScopeDefaults(input, {
                    ...defaults,
                    userId: scope.userId,
                    catalog: defaults.catalog ?? scope.catalog,
                    scopeId: defaults.scopeId ?? scope.xpertId,
                    isolateByUser: defaults.isolateByUser ?? true
                })
            }
        }
        return applyRuntimeScopeDefaults(input, defaults)
    }

    appData(_options: WorkspaceAppDataOptions): WorkspaceStorage {
        throw new BadRequestException(t('server-ai:Error.WorkspaceAppDataScopeRequired'))
    }

    async uploadBuffer(input: WorkspaceUploadBufferInput): Promise<WorkspaceFile> {
        if (!Buffer.isBuffer(input.buffer) || !input.buffer.length) {
            throw new BadRequestException('workspace file buffer is required')
        }
        const originalName =
            normalizeOptionalString(input.originalName) ?? normalizeOptionalString(input.fileName) ?? 'workspace-file'
        const { volumeScope, catalog, scopeId } = await this.resolveVolumeScope(input, 'write')
        await this.assertCanMutateVolume(volumeScope)
        const targetPath = path.posix.join(
            normalizeOptionalString(input.folder) ?? '',
            normalizeOptionalString(input.fileName) ?? originalName
        )
        assertPublicWorkspacePath(targetPath)
        if (catalog === 'projects' && isProjectGovernedContentPath(targetPath)) {
            throw new BadRequestException(
                t('server-ai:Error.ProjectGovernedContentRuntimeReadOnly', {
                    defaultValue: 'Project instructions and skills are read-only during Agent runtime'
                })
            )
        }
        const asset = await this.commandBus.execute(
            new UploadFileCommand({
                source: {
                    kind: 'buffer',
                    buffer: input.buffer,
                    originalName,
                    mimeType: normalizeOptionalString(input.mimeType),
                    size: typeof input.size === 'number' ? input.size : input.buffer.length
                },
                targets: [
                    {
                        kind: 'volume',
                        ...volumeScope,
                        folder: normalizeOptionalString(input.folder),
                        fileName: normalizeOptionalString(input.fileName),
                        metadata: input.metadata
                    }
                ]
            })
        )
        const destination = getFileAssetDestination(asset, 'volume')
        if (!destination || destination.status !== 'success' || !destination.path) {
            throw new InternalServerErrorException(destination?.error || 'Failed to upload workspace file')
        }

        const volume = this.volumeClient.resolve(volumeScope)
        const fileUrl = volume.exposesDirectFileUrls()
            ? (normalizeOptionalString(destination.url) ?? normalizeOptionalString(destination.metadata?.fileUrl))
            : undefined
        return {
            name: normalizeOptionalString(input.fileName) ?? originalName,
            filePath: destination.path,
            workspacePath: destination.path,
            ...(fileUrl ? { fileUrl, url: fileUrl } : {}),
            ...(normalizeOptionalString(input.mimeType) ? { mimeType: normalizeOptionalString(input.mimeType) } : {}),
            size: typeof input.size === 'number' ? input.size : input.buffer.length,
            catalog,
            scopeId,
            metadata: destination.metadata
        }
    }

    async understandFile(input: WorkspaceUnderstandFileInput): Promise<WorkspaceUnderstoodFile> {
        const filePath = normalizeRequiredWorkspaceFilePath(input.filePath)
        assertPublicWorkspacePath(filePath)
        const { volumeScope, catalog, scopeId } = await this.resolveVolumeScope(input)
        const fileAsset = await this.commandBus.execute<CreateWorkspaceFileAssetCommand, FileAsset>(
            new CreateWorkspaceFileAssetCommand({
                ...input,
                ...volumeScope,
                scopeId,
                filePath
            })
        )
        const metadata = readWorkspaceMetadata(fileAsset.metadata)
        const fileUrl = this.volumeClient.resolve(volumeScope).exposesDirectFileUrls()
            ? (normalizeOptionalString(input.fileUrl) ?? normalizeOptionalString(input.url) ?? metadata.fileUrl)
            : undefined
        const originalName =
            normalizeOptionalString(input.originalName) ??
            normalizeOptionalString(fileAsset.originalName) ??
            filePath.split('/').filter(Boolean).pop() ??
            filePath
        const mimeType = normalizeOptionalString(fileAsset.mimeType) ?? metadata.mimeType
        const size =
            typeof input.size === 'number' && Number.isFinite(input.size)
                ? input.size
                : typeof fileAsset.size === 'number'
                  ? fileAsset.size
                  : metadata.size

        return {
            id: fileAsset.id,
            fileId: fileAsset.id,
            fileAssetId: fileAsset.id,
            ...(fileAsset.storageFileId ? { storageFileId: fileAsset.storageFileId } : {}),
            name: originalName,
            originalName,
            filePath,
            workspacePath: fileAsset.workspacePath ?? filePath,
            ...(fileUrl ? { fileUrl, url: fileUrl } : {}),
            ...(mimeType ? { mimeType } : {}),
            ...(typeof size === 'number' ? { size } : {}),
            catalog,
            scopeId,
            status: fileAsset.status,
            parseStatus: fileAsset.status,
            purpose: fileAsset.purpose,
            parseMode: fileAsset.parseMode,
            capabilities: fileAsset.capabilities ?? [],
            summary: fileAsset.summary,
            metadata: fileAsset.metadata
        }
    }

    async getUnderstandingStatus(input: WorkspaceUnderstandingStatusInput): Promise<WorkspaceUnderstandingStatus> {
        const queryBus = this.requireQueryBus()
        await this.assertUnderstandingAssetVisible(input, 'read')
        const status = await queryBus.execute(
            new GetFileUnderstandingStatusQuery(input.fileAssetId, this.resolveUnderstandingScope(input))
        )
        const { parsedAt, ...rest } = status
        return {
            ...rest,
            ...(parsedAt ? { parsedAt: parsedAt instanceof Date ? parsedAt.toISOString() : parsedAt } : {})
        }
    }

    async retryUnderstanding(input: WorkspaceRetryUnderstandingInput): Promise<WorkspaceUnderstandingStatus> {
        const current = await this.getUnderstandingStatus(input)
        if (
            current.status !== 'failed' &&
            current.vectorIndexStatus !== 'failed' &&
            current.vectorIndexStatus !== 'unavailable'
        ) {
            throw new BadRequestException('Only failed or unavailable file understanding can be retried')
        }
        await this.assertUnderstandingAssetVisible(input, 'parse')
        await this.commandBus.execute(new EnqueueFileParseCommand(input.fileAssetId))
        return this.getUnderstandingStatus(input)
    }

    async validateUnderstandingReferences(
        input: WorkspaceValidateUnderstandingReferencesInput
    ): Promise<WorkspaceValidatedUnderstandingReference[]> {
        if (!Array.isArray(input.references) || !input.references.length || input.references.length > 120) {
            throw new BadRequestException('references must contain between 1 and 120 items')
        }
        const excerptLength = Math.min(Math.max(input.excerptLength ?? 320, 80), 800)
        await Promise.all(
            [...new Set(input.references.map((reference) => reference.fileAssetId))].map((fileAssetId) =>
                this.assertUnderstandingAssetVisible({ ...input, fileAssetId }, 'read')
            )
        )
        return this.requireQueryBus().execute(
            new ValidateFileUnderstandingReferencesQuery(
                input.references,
                excerptLength,
                this.resolveUnderstandingScope(input)
            )
        )
    }

    /** Page the existing parsed chunks after verifying FileAsset workspace visibility. */
    async listUnderstandingChunks(
        input: WorkspaceListUnderstandingChunksInput
    ): Promise<WorkspaceUnderstandingChunkPage> {
        await this.assertUnderstandingAssetVisible(input)
        const page = Math.max(input.page ?? 1, 1)
        const pageSize = Math.min(Math.max(input.pageSize ?? 50, 1), 100)
        const chunks = await this.requireQueryBus().execute(
            new SearchFileChunksQuery({
                fileId: input.fileAssetId,
                limit: pageSize + 1,
                offset: (page - 1) * pageSize
            })
        )
        const hasMore = chunks.length > pageSize
        return {
            fileAssetId: input.fileAssetId,
            items: chunks.slice(0, pageSize).map((chunk) => this.toUnderstandingChunk(chunk, input.contentLength)),
            page,
            pageSize,
            hasMore
        }
    }

    /** Search the platform FileChunk index; no plugin-side embeddings are created. */
    async searchUnderstandingChunks(
        input: WorkspaceSearchUnderstandingChunksInput
    ): Promise<WorkspaceUnderstandingChunk[]> {
        const query = normalizeOptionalString(input.query)
        if (!query) {
            throw new BadRequestException('query is required for file understanding search')
        }
        await this.assertUnderstandingAssetVisible(input)
        const limit = Math.min(Math.max(input.limit ?? 8, 1), 30)
        const chunks = await this.requireQueryBus().execute(
            new SearchFileChunksQuery({ fileId: input.fileAssetId, query, limit })
        )
        return chunks.map((chunk) => this.toUnderstandingChunk(chunk, input.contentLength))
    }

    /** Resolve a locator without Agent-specific defaults. Prefer scoped APIs in middleware runtimes. */
    async resolveRuntimeReference(input: WorkspaceFileLocator): Promise<WorkspacePortableFileReference> {
        return this.resolveRuntimeReferenceWithDefaults(input, {})
    }

    /** Read a runtime locator without Agent-specific defaults. Prefer scoped APIs in middleware runtimes. */
    async readRuntimeBuffer(input: WorkspaceFileLocator): Promise<WorkspaceRuntimeFileBuffer> {
        return this.readRuntimeBufferWithDefaults(input, {})
    }

    /** Write bytes without Agent-specific defaults. Prefer scoped APIs in middleware runtimes. */
    async writeRuntimeBuffer(
        input: WorkspaceRuntimeWriteInput
    ): Promise<WorkspaceFile & { reference: WorkspacePortableFileReference }> {
        return this.writeRuntimeBufferWithDefaults(input, {})
    }

    async readBuffer(input: WorkspaceFileReference): Promise<WorkspaceFileBuffer> {
        const filePath = normalizeRequiredWorkspaceFilePath(input.filePath)
        assertPublicWorkspacePath(filePath)
        const { volumeScope, catalog, scopeId } = await this.resolveVolumeScope(input)
        const volume = this.volumeClient.resolve(volumeScope)
        const client = new VolumeSubtreeClient(volume, { allowRootWorkspace: true })
        const buffer = await client.readBuffer('', filePath)
        const fileUrl = volume.exposesDirectFileUrls() ? volume.publicUrl(filePath) : undefined

        return {
            name: filePath.split('/').filter(Boolean).pop() ?? filePath,
            filePath,
            workspacePath: filePath,
            ...(fileUrl ? { fileUrl, url: fileUrl } : {}),
            size: buffer.length,
            catalog,
            scopeId,
            buffer
        }
    }

    /**
     * Resolve one workspace file for browser preview or download without
     * loading the file bytes into the API process.
     */
    async resolveFile(input: WorkspaceFileReference): Promise<WorkspaceFile> {
        const filePath = normalizeRequiredWorkspaceFilePath(input.filePath)
        assertPublicWorkspacePath(filePath)
        const { volumeScope, catalog, scopeId } = await this.resolveVolumeScope(input)
        const volume = this.volumeClient.resolve(volumeScope)
        const source = await this.resolveReadOnlyFileSource(input)
        const fileUrl = volume.exposesDirectFileUrls() ? volume.publicUrl(filePath) : undefined

        return {
            name: filePath.split('/').filter(Boolean).pop() ?? filePath,
            filePath,
            workspacePath: filePath,
            ...(fileUrl ? { fileUrl, url: fileUrl } : {}),
            size: source.size,
            catalog,
            scopeId
        }
    }

    /**
     * Resolve one portable Workspace reference to the exact underlying regular
     * file without returning the path through the public WorkspaceFilesApi.
     * Sandbox Jobs Core is the only intended caller.
     */
    async resolveReadOnlyFileSource(input: WorkspaceFileReference): Promise<WorkspaceReadOnlyFileSource> {
        const filePath = normalizeRequiredWorkspaceFilePath(input.filePath)
        assertPublicWorkspacePath(filePath)
        const { volumeScope } = await this.resolveVolumeScope(input)
        const volume = this.volumeClient.resolve(volumeScope)
        const serverRoot = await realpath(volume.serverRoot).catch(() => null)
        const requestedPath = volume.path(filePath)
        const serverPath = await realpath(requestedPath).catch(() => null)
        if (!serverRoot || !serverPath) {
            throw new BadRequestException('Workspace file not found')
        }
        const relativePath = path.relative(serverRoot, serverPath)
        if (!relativePath || relativePath.startsWith('..') || path.isAbsolute(relativePath)) {
            throw new BadRequestException('Workspace file path is outside of its scoped volume')
        }
        const fileStat = await stat(serverPath).catch(() => null)
        if (!fileStat?.isFile()) {
            throw new BadRequestException('Workspace file not found')
        }
        assertPublicWorkspacePath(relativePath, fileStat)
        const hostRoot = path.resolve(volume.hostRoot)
        const hostPath = path.resolve(hostRoot, relativePath)
        const hostRelativePath = path.relative(hostRoot, hostPath)
        if (!hostRelativePath || hostRelativePath.startsWith('..') || path.isAbsolute(hostRelativePath)) {
            throw new BadRequestException('Workspace Provider path is outside of its scoped volume')
        }
        return {
            serverPath,
            hostPath,
            size: fileStat.size,
            mtimeMs: fileStat.mtimeMs,
            device: fileStat.dev,
            inode: fileStat.ino
        }
    }

    async deleteFile(input: WorkspaceFileReference): Promise<void> {
        const filePath = normalizeRequiredWorkspaceFilePath(input.filePath)
        assertPublicWorkspacePath(filePath)
        const { volumeScope, catalog } = await this.resolveVolumeScope(input, 'delete')
        await this.assertCanMutateVolume(volumeScope)
        if (catalog === 'projects' && isProjectGovernedContentPath(filePath)) {
            throw new BadRequestException(
                t('server-ai:Error.ProjectGovernedContentRuntimeReadOnly', {
                    defaultValue: 'Project instructions and skills are read-only during Agent runtime'
                })
            )
        }
        const client = new VolumeSubtreeClient(this.volumeClient.resolve(volumeScope), { allowRootWorkspace: true })
        await client.deleteFile('', filePath)
    }

    /**
     * Normalize a sandbox path, relative path, or portable reference into a
     * scoped reference that can be persisted and replayed outside this request.
     */
    private async resolveRuntimeReferenceWithDefaults(
        input: WorkspaceFileLocator,
        defaults: WorkspaceFilesRuntimeDefaults
    ): Promise<WorkspacePortableFileReference> {
        const descriptor = toWorkspaceRuntimeDescriptor(input)
        const { filePath, fileAsset } = await this.resolveRuntimeFileLocation(
            readRuntimeFilePath(descriptor),
            defaults,
            descriptor.source === WORKSPACE_FILES_SOURCE
        )
        assertPublicWorkspacePath(filePath)
        let scopedInput = await this.applyFileDefaults(
            {
                ...readRuntimeScope(descriptor),
                ...(descriptor.source === WORKSPACE_FILES_SOURCE ? { source: WORKSPACE_FILES_SOURCE } : {}),
                filePath
            },
            defaults
        )
        // An authorized attachment ID retains its source just like a portable reference.
        const sourceScope = fileAsset && resolveFileAssetWorkspaceVolumeScope(fileAsset)
        if (
            !scopedInput.projectId &&
            sourceScope?.catalog === 'user-xperts' &&
            sourceScope.tenantId === scopedInput.tenantId &&
            sourceScope.xpertId === scopedInput.xpertId
        ) {
            scopedInput = await this.applyFileDefaults(
                {
                    ...readRuntimeScope(descriptor),
                    userId: sourceScope.userId,
                    source: WORKSPACE_FILES_SOURCE,
                    filePath
                },
                defaults
            )
        }
        const { volumeScope, catalog, scopeId } = await this.resolveVolumeScope(scopedInput)
        const workspacePath = toRuntimeWorkspacePath(filePath, defaults)
        const originalName = normalizeOptionalString(descriptor.originalName)
        const name = normalizeOptionalString(descriptor.name) ?? originalName
        const mimeType =
            normalizeOptionalString(descriptor.mimeType) ??
            normalizeOptionalString((descriptor as { mimetype?: unknown }).mimetype)
        const size =
            typeof descriptor.size === 'number' && Number.isFinite(descriptor.size) ? descriptor.size : undefined

        return {
            source: WORKSPACE_FILES_SOURCE,
            filePath,
            workspacePath,
            tenantId: volumeScope.tenantId,
            ...(normalizeOptionalString(scopedInput.organizationId)
                ? { organizationId: normalizeOptionalString(scopedInput.organizationId) }
                : {}),
            ...(volumeScope.userId ? { userId: volumeScope.userId } : {}),
            catalog,
            ...(scopeId ? { scopeId } : {}),
            ...(volumeScope.projectId ? { projectId: volumeScope.projectId } : {}),
            ...(volumeScope.knowledgeId ? { knowledgeId: volumeScope.knowledgeId } : {}),
            ...(volumeScope.rootId ? { rootId: volumeScope.rootId } : {}),
            ...(volumeScope.xpertId ? { xpertId: volumeScope.xpertId } : {}),
            ...(typeof volumeScope.isolateByUser === 'boolean' ? { isolateByUser: volumeScope.isolateByUser } : {}),
            ...(originalName ? { originalName } : {}),
            ...(name ? { name } : {}),
            ...(mimeType ? { mimeType } : {}),
            ...(typeof size === 'number' ? { size } : {})
        }
    }

    private async resolveRuntimeFileLocation(
        value: unknown,
        defaults: WorkspaceFilesRuntimeDefaults,
        volumeRelative = false
    ): Promise<{ filePath: string; fileAsset?: FileAsset }> {
        const raw = normalizeOptionalString(value)
        if (!raw || !UUID_PATTERN.test(raw) || !this.queryBus) {
            return {
                filePath: volumeRelative
                    ? normalizeVolumeRelativeFilePath(value)
                    : normalizeRuntimeWorkspaceFilePath(value, defaults)
            }
        }

        const fileAsset = await this.resolveAuthorizedRuntimeFileAsset(raw, defaults)
        if (!fileAsset) {
            return {
                filePath: volumeRelative
                    ? normalizeVolumeRelativeFilePath(value)
                    : normalizeRuntimeWorkspaceFilePath(value, defaults)
            }
        }

        const relativePath = resolveFileAssetWorkspaceRelativePath(fileAsset)
        if (!relativePath) {
            throw new BadRequestException('Workspace file not found')
        }
        return { filePath: normalizeVolumeRelativeFilePath(relativePath), fileAsset }
    }

    private async resolveAuthorizedRuntimeFileAsset(raw: string, defaults: WorkspaceFilesRuntimeDefaults) {
        const authority = this.resolveFileAssetAuthority(defaults)
        const locators: FileAssetLocator[] = [{ fileAssetId: raw }, { storageFileId: raw }]
        for (const locator of locators) {
            try {
                const authorized = await this.requireQueryBus().execute(
                    new ResolveAuthorizedFileAssetQuery({ locator, authority, operation: 'read' })
                )
                if (authorized?.asset) {
                    return authorized.asset
                }
            } catch (error) {
                if (!(error instanceof ForbiddenException)) {
                    throw error
                }
                // Bare UUID locators are backwards compatible with both FileAsset and StorageFile ids.
            }
        }
        return null
    }

    /**
     * Read file bytes through the same resolver used to produce the returned
     * portable reference.
     */
    private async readRuntimeBufferWithDefaults(
        input: WorkspaceFileLocator,
        defaults: WorkspaceFilesRuntimeDefaults
    ): Promise<WorkspaceRuntimeFileBuffer> {
        const reference = await this.resolveRuntimeReferenceWithDefaults(input, defaults)
        const file = await this.readBuffer(reference)
        return {
            ...file,
            workspacePath: reference.workspacePath,
            ...(reference.name || reference.originalName
                ? { name: reference.name ?? reference.originalName ?? file.name }
                : {}),
            ...(reference.mimeType ? { mimeType: reference.mimeType } : {}),
            reference
        }
    }

    /**
     * Write bytes into the scoped runtime workspace and return the platform
     * reference that future async jobs should store.
     */
    private async writeRuntimeBufferWithDefaults(
        input: WorkspaceRuntimeWriteInput,
        defaults: WorkspaceFilesRuntimeDefaults
    ): Promise<WorkspaceFile & { reference: WorkspacePortableFileReference }> {
        const descriptor = toWorkspaceRuntimeDescriptor(input)
        const rawRuntimePath = readRuntimeFilePath(descriptor, false)
        let folder = normalizeOptionalString(input.folder)
        let fileName = normalizeOptionalString(input.fileName)
        if (rawRuntimePath) {
            const filePath = normalizeRuntimeWorkspaceFilePath(rawRuntimePath, defaults)
            folder = folder ?? normalizeUploadFolder(path.posix.dirname(filePath))
            fileName = fileName ?? path.posix.basename(filePath)
        }

        const originalName =
            normalizeOptionalString(input.originalName) ??
            normalizeOptionalString(input.name) ??
            fileName ??
            'workspace-file'
        const mimeType = normalizeOptionalString(input.mimeType) ?? normalizeOptionalString(input.mimetype)
        const uploaded = await this.uploadBuffer(
            await this.applyFileDefaults(
                {
                    ...input,
                    originalName,
                    ...(mimeType ? { mimeType } : {}),
                    ...(folder ? { folder } : {}),
                    ...(fileName ? { fileName } : {})
                },
                defaults
            )
        )
        const reference = await this.resolveRuntimeReferenceWithDefaults(
            {
                ...input,
                // This is a new file in the current workspace, not a replay of an old reference.
                source: undefined,
                filePath: uploaded.filePath,
                workspacePath: uploaded.filePath,
                originalName,
                name: uploaded.name,
                mimeType: uploaded.mimeType,
                size: uploaded.size
            },
            defaults
        )

        return {
            ...uploaded,
            workspacePath: reference.workspacePath,
            reference
        }
    }

    private async resolveVolumeScope(
        input: WorkspaceFileScope & { source?: unknown },
        operation: 'read' | 'write' | 'delete' = 'read'
    ): Promise<{
        volumeScope: WorkspaceVolumeScopeResolution['volumeScope']
        catalog: WorkspaceFile['catalog']
        scopeId?: string
    }> {
        const requestedTenantId = normalizeOptionalString(input.tenantId)
        const actorTenantId = RequestContext.currentTenantId()
        if (requestedTenantId && actorTenantId && requestedTenantId !== actorTenantId) {
            throw new ForbiddenException('Workspace file tenant is outside the current actor scope')
        }
        const tenantId = actorTenantId ?? requestedTenantId
        if (!tenantId) {
            throw new BadRequestException('tenantId is required for workspace file access')
        }
        const catalog = normalizeOptionalString(input.catalog)
        if (catalog && !isWorkspaceFileCatalog(catalog)) {
            throw new BadRequestException(`Unsupported workspace file catalog: ${catalog}`)
        }
        const actorUserId = RequestContext.currentUserId()
        const requestedUserId = normalizeOptionalString(input.userId)
        const requestedScopeId = normalizeOptionalString(input.scopeId)
        if (catalog === 'users' && actorUserId && requestedUserId && requestedUserId !== actorUserId) {
            throw new ForbiddenException('Workspace user scope is outside the current actor scope')
        }
        if (catalog === 'users' && actorUserId && requestedScopeId && requestedScopeId !== actorUserId) {
            throw new ForbiddenException('Workspace user scope is outside the current actor scope')
        }
        const userId =
            (catalog === 'users' || catalog === 'user-xperts') && actorUserId
                ? actorUserId
                : (requestedUserId ?? actorUserId)

        const resolved = resolveWorkspaceVolumeScope(input, { tenantId, userId })
        if (!resolved) {
            throw new BadRequestException(resolveWorkspaceVolumeScopeError(input, 'workspace file access'))
        }
        if (resolved.catalog === 'xperts' || resolved.catalog === 'user-xperts') {
            const scope = await authorizeAssistantWorkspace(input, operation, this.commandBus)
            // Portable references retain their physical owner after authorization.
            // Ordinary runtime paths still select the current owner workspace.
            if (
                operation !== 'write' &&
                scope.catalog === 'user-xperts' &&
                input.source === WORKSPACE_FILES_SOURCE &&
                requestedUserId
            ) {
                return {
                    volumeScope: { ...scope, userId: requestedUserId },
                    catalog: scope.catalog,
                    scopeId: scope.xpertId
                }
            }
            return { volumeScope: scope, catalog: scope.catalog, scopeId: scope.xpertId }
        }
        return resolved
    }

    private async assertCanMutateVolume(volumeScope: WorkspaceVolumeScopeResolution['volumeScope']) {
        if (volumeScope.catalog !== 'projects') {
            return
        }
        const projectId = normalizeOptionalString(volumeScope.projectId)
        if (!projectId) {
            throw new BadRequestException('projectId is required for Project workspace file mutation')
        }
        const projectAccess = this.capabilities.get(ProjectAccessRuntimeCapability)
        if (!projectAccess) {
            throw new InternalServerErrorException('Project access runtime capability is unavailable')
        }
        await projectAccess.assertEdit({
            projectId,
            actor: {
                tenantId: RequestContext.currentTenantId(),
                organizationId: RequestContext.getOrganizationId(),
                userId: RequestContext.currentUserId()
            }
        })
    }

    private resolveUnderstandingScope(input: WorkspaceFileScope) {
        const requestedTenantId = normalizeOptionalString(input.tenantId)
        const actorTenantId = RequestContext.currentTenantId()
        if (requestedTenantId && actorTenantId && requestedTenantId !== actorTenantId) {
            throw new ForbiddenException('File understanding tenant is outside the current actor scope')
        }
        const tenantId = actorTenantId ?? requestedTenantId
        if (!tenantId) {
            throw new BadRequestException('tenantId is required for file understanding access')
        }
        return {
            tenantId,
            organizationId: normalizeOptionalString(input.organizationId) ?? RequestContext.getOrganizationId() ?? null,
            projectId: normalizeOptionalString(input.projectId),
            xpertId: normalizeOptionalString(input.xpertId)
        }
    }

    /** Normalize unauthorized assets to the same scoped not-found failure. */
    private async assertUnderstandingAssetVisible(
        input: WorkspaceUnderstandingStatusInput,
        operation: FileAssetOperation = 'read'
    ) {
        try {
            const authorized = await this.requireQueryBus().execute(
                new ResolveAuthorizedFileAssetQuery({
                    locator: { fileAssetId: input.fileAssetId },
                    authority: this.resolveFileAssetAuthority(input),
                    operation
                })
            )
            if (!authorized?.asset) {
                throw new Error('File asset access was not resolved')
            }
        } catch {
            throw new BadRequestException('File understanding asset was not found in the current workspace')
        }
    }

    private resolveFileAssetAuthority(input: object): FileAssetAuthority {
        const conversationId = 'conversationId' in input ? normalizeOptionalString(input.conversationId) : undefined
        return conversationId ? { kind: 'conversation', conversationId } : { kind: 'current-owner' }
    }

    /** Convert a persisted chunk to the bounded plugin-facing DTO. */
    private toUnderstandingChunk(chunk: FileChunk, requestedLength?: number): WorkspaceUnderstandingChunk {
        if (!chunk.id) {
            throw new InternalServerErrorException('File understanding chunk is missing its persisted identifier')
        }
        const contentLength = Math.min(Math.max(requestedLength ?? 12_000, 320), 12_000)
        return {
            fileAssetId: chunk.fileAssetId,
            chunkId: chunk.id,
            orderNo: chunk.orderNo,
            ...(chunk.anchor ? { anchor: chunk.anchor } : {}),
            content: chunk.content.slice(0, contentLength)
        }
    }

    private requireQueryBus() {
        if (!this.queryBus) {
            throw new InternalServerErrorException('File understanding queries are unavailable')
        }
        return this.queryBus
    }
}

function readWorkspaceMetadata(metadata?: Record<string, unknown>) {
    const workspace = metadata?.workspace
    if (!workspace || typeof workspace !== 'object' || Array.isArray(workspace)) {
        return {}
    }
    const record = workspace as Record<string, unknown>
    return {
        fileUrl: normalizeOptionalString(record.fileUrl),
        mimeType: normalizeOptionalString(record.mimeType),
        size: typeof record.size === 'number' && Number.isFinite(record.size) ? record.size : undefined
    }
}
