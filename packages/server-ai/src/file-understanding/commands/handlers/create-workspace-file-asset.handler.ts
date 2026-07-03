import { BadRequestException, Inject } from '@nestjs/common'
import { CommandBus, CommandHandler, ICommandHandler } from '@nestjs/cqrs'
import { InjectRepository } from '@nestjs/typeorm'
import { RequestContext } from '@xpert-ai/server-core'
import type { WorkspaceFileCatalog, WorkspaceUnderstandFileInput } from '@xpert-ai/plugin-sdk'
import fsPromises from 'node:fs/promises'
import mime from 'mime-types'
import path from 'node:path'
import { Repository } from 'typeorm'
import { ConversationFileLink, FileAsset } from '../../entities'
import type { FileAssetPurpose, FileParseMode } from '../../domain/types'
import {
    isWorkspaceFileCatalog,
    resolveWorkspaceFileCatalog,
    resolveWorkspaceVolumeScope,
    type WorkspaceVolumeScopeResolution
} from '../../domain/workspace-file'
import { VOLUME_CLIENT, VolumeClient } from '../../../shared/volume'
import { CreateWorkspaceFileAssetCommand } from '../create-workspace-file-asset.command'
import { EnqueueFileParseCommand } from '../enqueue-file-parse.command'

@CommandHandler(CreateWorkspaceFileAssetCommand)
export class CreateWorkspaceFileAssetHandler implements ICommandHandler<CreateWorkspaceFileAssetCommand> {
    constructor(
        @InjectRepository(FileAsset)
        private readonly fileAssetRepository: Repository<FileAsset>,
        @InjectRepository(ConversationFileLink)
        private readonly conversationFileLinkRepository: Repository<ConversationFileLink>,
        @Inject(VOLUME_CLIENT)
        private readonly volumeClient: VolumeClient,
        private readonly commandBus: CommandBus
    ) {}

    async execute(command: CreateWorkspaceFileAssetCommand) {
        const input = command.input
        const filePath = normalizeWorkspaceFilePath(input.filePath)
        const { volumeScope, catalog, scopeId } = this.resolveVolumeScope(input)
        const volume = await this.volumeClient.resolve(volumeScope).ensureRoot()
        const absolutePath = volume.path(filePath)
        const stat = await fsPromises.stat(absolutePath).catch(() => null)
        if (!stat?.isFile()) {
            throw new BadRequestException(`Workspace file "${filePath}" was not found`)
        }

        const originalName = normalizeOptionalString(input.originalName) ?? path.posix.basename(filePath)
        const detectedMimeType = mime.lookup(originalName)
        const mimeType =
            normalizeOptionalString(input.mimeType) ?? (detectedMimeType ? String(detectedMimeType) : undefined)
        const size = typeof input.size === 'number' && Number.isFinite(input.size) ? input.size : stat.size
        const purpose = resolvePurpose(input.purpose)
        const parseMode = resolveParseMode(input.parseMode)
        const tenantId = normalizeOptionalString(input.tenantId) ?? RequestContext.currentTenantId()
        const organizationId = RequestContext.getOrganizationId()
        const userId = normalizeOptionalString(input.userId) ?? RequestContext.currentUserId()
        const fileUrl =
            normalizeOptionalString(input.fileUrl) ?? normalizeOptionalString(input.url) ?? volume.publicUrl(filePath)
        const workspacePath = filePath
        const metadata = buildWorkspaceFileAssetMetadata(input, {
            catalog,
            scopeId,
            filePath,
            workspacePath,
            absolutePath,
            fileUrl,
            mimeType,
            size
        })

        const fileAsset = await this.fileAssetRepository.save(
            this.fileAssetRepository.create({
                tenantId,
                organizationId,
                userId,
                conversationId: normalizeOptionalString(input.conversationId),
                threadId: normalizeOptionalString(input.threadId),
                projectId: normalizeOptionalString(input.projectId),
                xpertId: normalizeOptionalString(input.xpertId),
                originalName,
                fileName: filePath,
                mimeType,
                size,
                purpose,
                parseMode,
                status: 'uploaded',
                capabilities: ['preview', 'workspace'],
                workspacePath,
                metadata
            })
        )

        if (fileAsset.conversationId) {
            await this.conversationFileLinkRepository.save(
                this.conversationFileLinkRepository.create({
                    tenantId,
                    organizationId,
                    conversationId: fileAsset.conversationId,
                    fileAssetId: fileAsset.id,
                    threadId: fileAsset.threadId,
                    metadata
                })
            )
        }

        if (parseMode === 'none') {
            fileAsset.status = 'ready'
            return await this.fileAssetRepository.save(fileAsset)
        }

        return await this.commandBus.execute<EnqueueFileParseCommand, FileAsset>(
            new EnqueueFileParseCommand(fileAsset.id, {
                runInline: shouldRunParseInline(input, parseMode, size)
            })
        )
    }

    private resolveVolumeScope(input: WorkspaceUnderstandFileInput): WorkspaceVolumeScopeResolution {
        const tenantId = normalizeOptionalString(input.tenantId) ?? RequestContext.currentTenantId()
        if (!tenantId) {
            throw new BadRequestException('tenantId is required for workspace file understanding')
        }
        const userId = normalizeOptionalString(input.userId) ?? RequestContext.currentUserId()
        const catalog = normalizeOptionalString(input.catalog)
        if (catalog && !isWorkspaceFileCatalog(catalog)) {
            throw new BadRequestException(`Unsupported workspace file catalog: ${catalog}`)
        }

        const resolved = resolveWorkspaceVolumeScope(input, { tenantId, userId, defaultCatalog: 'users' })
        if (!resolved) {
            throw new BadRequestException(
                resolveWorkspaceVolumeScopeError(input, 'workspace file understanding', 'users')
            )
        }
        return resolved
    }
}

function buildWorkspaceFileAssetMetadata(
    input: WorkspaceUnderstandFileInput,
    workspace: {
        catalog: WorkspaceFileCatalog
        scopeId?: string
        filePath: string
        workspacePath: string
        absolutePath: string
        fileUrl?: string
        mimeType?: string
        size?: number
    }
) {
    return compactRecord({
        ...(input.metadata ?? {}),
        workspace: compactRecord({
            source: 'platform.workspace.files',
            catalog: workspace.catalog,
            scopeId: workspace.scopeId,
            relativePath: workspace.filePath,
            workspacePath: workspace.workspacePath,
            absolutePath: workspace.absolutePath,
            fileUrl: workspace.fileUrl,
            mimeType: workspace.mimeType,
            size: workspace.size,
            projectedAt: new Date().toISOString()
        })
    })
}

function resolvePurpose(value: unknown): FileAssetPurpose {
    return value === 'workspace' || value === 'knowledge' || value === 'chat_attachment' ? value : 'chat_attachment'
}

function resolveParseMode(value: unknown): FileParseMode {
    return value === 'fast' || value === 'deep' || value === 'none' || value === 'auto' ? value : 'auto'
}

function shouldRunParseInline(input: WorkspaceUnderstandFileInput, parseMode: FileParseMode, size: number) {
    if (typeof input.runInline === 'boolean') {
        return input.runInline
    }
    if (parseMode === 'fast') {
        return true
    }
    if (parseMode === 'deep') {
        return false
    }
    return size <= 2_000_000
}

function normalizeWorkspaceFilePath(value: unknown) {
    const raw = normalizeOptionalString(value)
    if (!raw) {
        throw new BadRequestException('filePath is required for workspace file understanding')
    }
    const normalized = path.posix.normalize(raw.replace(/\\/g, '/')).replace(/^\/+/, '')
    if (!normalized || normalized === '.' || normalized.startsWith('../') || normalized === '..') {
        throw new BadRequestException('Invalid workspace file path')
    }
    return normalized
}

function normalizeOptionalString(value: unknown) {
    return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function resolveWorkspaceVolumeScopeError(
    input: WorkspaceUnderstandFileInput,
    context: string,
    defaultCatalog?: WorkspaceFileCatalog
) {
    const catalog = resolveWorkspaceFileCatalog(input, { defaultCatalog })
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
            return `${context} scope is required`
    }
}

function compactRecord<T extends Record<string, unknown>>(record: T): T {
    return Object.fromEntries(Object.entries(record).filter(([, value]) => value !== undefined && value !== null)) as T
}
