import { BadRequestException, Inject, Injectable, InternalServerErrorException } from '@nestjs/common'
import { CommandBus } from '@nestjs/cqrs'
import { realpath, stat } from 'node:fs/promises'
import path from 'node:path'
import {
    RequestContext,
    WorkspaceFile,
    WorkspaceFileBuffer,
    WorkspaceFileLocator,
    WorkspaceFileScope,
    WorkspacePortableFileReference,
    WorkspaceRuntimeFileBuffer,
    WorkspaceRuntimeWriteInput,
    WorkspaceFileReference,
    WorkspaceFilesApi,
    WorkspaceUnderstandFileInput,
    WorkspaceUnderstoodFile,
    WorkspaceUploadBufferInput
} from '@xpert-ai/plugin-sdk'
import { getFileAssetDestination, UploadFileCommand } from '@xpert-ai/server-core'
import {
    CreateWorkspaceFileAssetCommand,
    isWorkspaceFileCatalog,
    resolveWorkspaceFileCatalog,
    resolveWorkspaceVolumeScope,
    type FileAsset,
    type WorkspaceVolumeScopeResolution
} from '../../file-understanding'
import { VOLUME_CLIENT, VolumeClient, VolumeSubtreeClient } from '../volume'

const WORKSPACE_FILES_SOURCE = 'platform.workspace.files'

/**
 * Runtime workspace defaults captured from the current Agent execution.
 *
 * These values let plugin code pass simple paths while the platform supplies
 * tenant, user, project/Xpert scope, and sandbox workspace root information.
 */
export type WorkspaceFilesRuntimeDefaults = WorkspaceFileScope & {
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
export class WorkspaceFilesRuntimeCapabilityService implements WorkspaceFilesApi {
    readonly api: WorkspaceFilesApi = this

    constructor(
        @Inject(CommandBus)
        private readonly commandBus: Pick<CommandBus, 'execute'>,
        @Inject(VOLUME_CLIENT)
        private readonly volumeClient: Pick<VolumeClient, 'resolve'>
    ) {}

    /**
     * Create a workspace-files facade bound to one Agent runtime scope.
     *
     * Middleware tools receive this scoped API so `/workspace/foo` can be read
     * without exposing catalog, scopeId, tenantId, or projectId to the Agent.
     */
    createScopedApi(defaults: WorkspaceFilesRuntimeDefaults): WorkspaceFilesApi {
        return {
            uploadBuffer: (input) => this.uploadBuffer(applyRuntimeScopeDefaults(input, defaults)),
            understandFile: (input) => this.understandFile(applyRuntimeScopeDefaults(input, defaults)),
            readBuffer: (input) => this.readBuffer(applyRuntimeScopeDefaults(input, defaults)),
            deleteFile: (input) => this.deleteFile(applyRuntimeScopeDefaults(input, defaults)),
            resolveRuntimeReference: (input) => this.resolveRuntimeReferenceWithDefaults(input, defaults),
            readRuntimeBuffer: (input) => this.readRuntimeBufferWithDefaults(input, defaults),
            writeRuntimeBuffer: (input) => this.writeRuntimeBufferWithDefaults(input, defaults)
        }
    }

    async uploadBuffer(input: WorkspaceUploadBufferInput): Promise<WorkspaceFile> {
        if (!Buffer.isBuffer(input.buffer) || !input.buffer.length) {
            throw new BadRequestException('workspace file buffer is required')
        }
        const originalName =
            normalizeOptionalString(input.originalName) ?? normalizeOptionalString(input.fileName) ?? 'workspace-file'
        const { volumeScope, catalog, scopeId } = this.resolveVolumeScope(input)
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

        const fileUrl =
            normalizeOptionalString(destination.url) ?? normalizeOptionalString(destination.metadata?.fileUrl)
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
        const { catalog, scopeId } = this.resolveVolumeScope(input)
        const fileAsset = await this.commandBus.execute<CreateWorkspaceFileAssetCommand, FileAsset>(
            new CreateWorkspaceFileAssetCommand({
                ...input,
                filePath
            })
        )
        const metadata = readWorkspaceMetadata(fileAsset.metadata)
        const fileUrl = normalizeOptionalString(input.fileUrl) ?? normalizeOptionalString(input.url) ?? metadata.fileUrl
        const originalName =
            normalizeOptionalString(input.originalName) ??
            normalizeOptionalString(fileAsset.originalName) ??
            filePath.split('/').filter(Boolean).pop() ??
            filePath
        const mimeType =
            normalizeOptionalString(input.mimeType) ??
            normalizeOptionalString(fileAsset.mimeType) ??
            normalizeOptionalString(metadata.mimeType)
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
        const { volumeScope, catalog, scopeId } = this.resolveVolumeScope(input)
        const volume = this.volumeClient.resolve(volumeScope)
        const client = new VolumeSubtreeClient(volume, { allowRootWorkspace: true })
        const buffer = await client.readBuffer('', filePath)
        const fileUrl = volume.publicUrl(filePath)

        return {
            name: filePath.split('/').filter(Boolean).pop() ?? filePath,
            filePath,
            workspacePath: filePath,
            fileUrl,
            url: fileUrl,
            size: buffer.length,
            catalog,
            scopeId,
            buffer
        }
    }

    /**
     * Resolve one portable Workspace reference to the exact underlying regular
     * file without returning the path through the public WorkspaceFilesApi.
     * Sandbox Jobs Core is the only intended caller.
     */
    async resolveReadOnlyFileSource(input: WorkspaceFileReference): Promise<WorkspaceReadOnlyFileSource> {
        const filePath = normalizeRequiredWorkspaceFilePath(input.filePath)
        const { volumeScope } = this.resolveVolumeScope(input)
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
        const { volumeScope } = this.resolveVolumeScope(input)
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
        const filePath = normalizeRuntimeWorkspaceFilePath(readRuntimeFilePath(descriptor), defaults)
        const scopedInput = applyRuntimeScopeDefaults(
            {
                ...readRuntimeScope(descriptor),
                filePath
            },
            defaults
        )
        const { volumeScope, catalog, scopeId } = this.resolveVolumeScope(scopedInput)
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
            applyRuntimeScopeDefaults(
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

    private resolveVolumeScope(input: WorkspaceUploadBufferInput | WorkspaceFileReference): {
        volumeScope: WorkspaceVolumeScopeResolution['volumeScope']
        catalog: WorkspaceFile['catalog']
        scopeId?: string
    } {
        const tenantId = normalizeOptionalString(input.tenantId) ?? RequestContext.currentTenantId()
        if (!tenantId) {
            throw new BadRequestException('tenantId is required for workspace file access')
        }
        const userId = normalizeOptionalString(input.userId) ?? RequestContext.currentUserId()
        const catalog = normalizeOptionalString(input.catalog)
        if (catalog && !isWorkspaceFileCatalog(catalog)) {
            throw new BadRequestException(`Unsupported workspace file catalog: ${catalog}`)
        }

        const resolved = resolveWorkspaceVolumeScope(input, { tenantId, userId })
        if (!resolved) {
            throw new BadRequestException(resolveWorkspaceVolumeScopeError(input, 'workspace file access'))
        }
        return resolved
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

function normalizeOptionalString(value: unknown) {
    return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function toWorkspaceRuntimeDescriptor(
    input: WorkspaceFileLocator | WorkspaceRuntimeWriteInput
): Record<string, unknown> {
    return typeof input === 'string' ? { path: input } : ((input ?? {}) as Record<string, unknown>)
}

function readRuntimeFilePath(descriptor: Record<string, unknown>, required = true) {
    const raw =
        normalizeOptionalString(descriptor.filePath) ??
        normalizeOptionalString(descriptor.workspacePath) ??
        normalizeOptionalString(descriptor.path)
    if (!raw && required) {
        throw new BadRequestException('workspace file path is required')
    }
    return raw
}

function readRuntimeScope(descriptor: Record<string, unknown>): WorkspaceFileScope {
    return {
        tenantId: normalizeOptionalString(descriptor.tenantId),
        userId: normalizeOptionalString(descriptor.userId),
        catalog: normalizeOptionalString(descriptor.catalog) as WorkspaceFileScope['catalog'],
        scopeId: normalizeOptionalString(descriptor.scopeId),
        projectId: normalizeOptionalString(descriptor.projectId),
        knowledgeId: normalizeOptionalString(descriptor.knowledgeId),
        rootId: normalizeOptionalString(descriptor.rootId),
        xpertId: normalizeOptionalString(descriptor.xpertId),
        isolateByUser: typeof descriptor.isolateByUser === 'boolean' ? descriptor.isolateByUser : undefined
    }
}

/**
 * Fill missing scope fields from the current runtime and infer the default
 * workspace catalog. Project scope wins over Xpert scope because project
 * workspaces are the broader collaboration boundary.
 */
function applyRuntimeScopeDefaults<T extends WorkspaceFileScope>(input: T, defaults: WorkspaceFilesRuntimeDefaults): T {
    const scoped = { ...input } as T & WorkspaceFileScope
    scoped.tenantId = normalizeOptionalString(scoped.tenantId) ?? normalizeOptionalString(defaults.tenantId)
    scoped.userId = normalizeOptionalString(scoped.userId) ?? normalizeOptionalString(defaults.userId)

    if (!hasExplicitWorkspaceScope(scoped)) {
        const projectId = normalizeOptionalString(defaults.projectId)
        const xpertId = normalizeOptionalString(defaults.xpertId)
        if (projectId) {
            scoped.projectId = projectId
        } else if (xpertId) {
            scoped.xpertId = xpertId
            scoped.isolateByUser = scoped.isolateByUser ?? false
        }
    } else if (!normalizeOptionalString(scoped.scopeId)) {
        const catalog = normalizeOptionalString(scoped.catalog)
        if (catalog === 'projects' && !normalizeOptionalString(scoped.projectId)) {
            scoped.projectId = normalizeOptionalString(defaults.projectId)
        } else if (catalog === 'xperts' && !normalizeOptionalString(scoped.xpertId)) {
            scoped.xpertId = normalizeOptionalString(defaults.xpertId)
            scoped.isolateByUser = scoped.isolateByUser ?? false
        }
    }

    return scoped
}

function hasExplicitWorkspaceScope(scope: WorkspaceFileScope) {
    return Boolean(
        normalizeOptionalString(scope.catalog) ||
        normalizeOptionalString(scope.scopeId) ||
        normalizeOptionalString(scope.projectId) ||
        normalizeOptionalString(scope.knowledgeId) ||
        normalizeOptionalString(scope.rootId) ||
        normalizeOptionalString(scope.xpertId)
    )
}

function normalizeRequiredWorkspaceFilePath(value: unknown) {
    const normalized = normalizeOptionalString(value)?.replace(/\\/g, '/').replace(/^\/+/, '').replace(/^\.\//, '')
    if (!normalized || normalized === '.' || normalized.split('/').includes('..')) {
        throw new BadRequestException('workspace file path is required')
    }
    return normalized
}

/**
 * Convert sandbox-visible or workspace-relative paths into safe Volume-relative
 * paths. Absolute paths are accepted only when they are inside the runtime
 * workspace root, including Docker's canonical `/workspace` mount.
 */
function normalizeRuntimeWorkspaceFilePath(value: unknown, defaults: WorkspaceFilesRuntimeDefaults) {
    const raw = normalizeOptionalString(value)
    if (!raw) {
        throw new BadRequestException('workspace file path is required')
    }
    if (raw.includes('\0')) {
        throw new BadRequestException('workspace file path contains invalid characters')
    }

    const unixPath = raw.replace(/\\/g, '/')
    let relativePath = unixPath
    if (path.posix.isAbsolute(unixPath)) {
        const roots = uniqueWorkspaceRoots(defaults)
        const normalizedCandidate = path.posix.normalize(unixPath)
        const matchedRoot = roots.find((root) => {
            const normalizedRoot = path.posix.normalize(root)
            return normalizedCandidate === normalizedRoot || normalizedCandidate.startsWith(`${normalizedRoot}/`)
        })
        if (!matchedRoot) {
            throw new BadRequestException('absolute workspace file path must be inside the runtime workspace root')
        }
        const normalizedRoot = path.posix.normalize(matchedRoot)
        if (normalizedCandidate === normalizedRoot) {
            throw new BadRequestException('workspace file path must point to a file below the workspace root')
        }
        relativePath = unixPath.slice(matchedRoot.length).replace(/^\/+/, '')
    }

    const parts = relativePath.split('/').filter((part) => part && part !== '.')
    if (!parts.length || parts.some((part) => part === '..')) {
        throw new BadRequestException('invalid workspace file path')
    }

    const normalized = path.posix.normalize(parts.join('/'))
    if (
        !normalized ||
        normalized === '.' ||
        normalized === '..' ||
        normalized.startsWith('../') ||
        path.posix.isAbsolute(normalized)
    ) {
        throw new BadRequestException('invalid workspace file path')
    }
    return normalized
}

/** Return the possible sandbox workspace roots for the current runtime scope. */
function uniqueWorkspaceRoots(defaults: WorkspaceFilesRuntimeDefaults) {
    const roots = [
        normalizeOptionalString(defaults.workspaceRoot),
        normalizeOptionalString(defaults.workspacePath),
        '/workspace'
    ].filter(Boolean) as string[]
    return Array.from(
        new Set(roots.map((root) => path.posix.normalize(root.replace(/\\/g, '/')).replace(/\/+$/, '') || '/'))
    )
}

/** Rebuild the sandbox-visible workspace path stored in portable references. */
function toRuntimeWorkspacePath(filePath: string, defaults: WorkspaceFilesRuntimeDefaults) {
    const workspaceRoot = uniqueWorkspaceRoots(defaults)[0] ?? '/workspace'
    return path.posix.join(workspaceRoot, filePath)
}

function normalizeUploadFolder(value: string) {
    return value && value !== '.' ? value : undefined
}

function resolveWorkspaceVolumeScopeError(input: WorkspaceUploadBufferInput | WorkspaceFileReference, context: string) {
    const catalog = resolveWorkspaceFileCatalog(input)
    switch (catalog) {
        case 'projects':
            return `projectId is required for project ${context}`
        case 'xperts':
            return `xpertId is required for xpert ${context}`
        case 'users':
            return `userId is required for user ${context}`
        case 'knowledges':
            return `knowledgeId is required for knowledge ${context}`
        case 'skills':
            return `rootId is required for skill ${context}`
        default:
            return 'workspace file catalog is required'
    }
}
