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
import { VOLUME_CLIENT, VolumeClient, type VolumeScope } from '../../../shared/volume'
import { CreateWorkspaceFileAssetCommand } from '../create-workspace-file-asset.command'
import { EnqueueFileParseCommand } from '../enqueue-file-parse.command'

type WorkspaceScopeResolution = {
    volumeScope: VolumeScope
    catalog: WorkspaceFileCatalog
    scopeId?: string
}

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

    private resolveVolumeScope(input: WorkspaceUnderstandFileInput): WorkspaceScopeResolution {
        const tenantId = normalizeOptionalString(input.tenantId) ?? RequestContext.currentTenantId()
        if (!tenantId) {
            throw new BadRequestException('tenantId is required for workspace file understanding')
        }
        const userId = normalizeOptionalString(input.userId) ?? RequestContext.currentUserId()
        const catalog = resolveWorkspaceFileCatalog(input)

        switch (catalog) {
            case 'projects': {
                const projectId = normalizeOptionalString(input.projectId) ?? normalizeOptionalString(input.scopeId)
                if (!projectId) {
                    throw new BadRequestException('projectId is required for project workspace file understanding')
                }
                return {
                    volumeScope: {
                        tenantId,
                        catalog,
                        projectId,
                        userId
                    },
                    catalog,
                    scopeId: projectId
                }
            }
            case 'xperts': {
                const xpertId = normalizeOptionalString(input.xpertId) ?? normalizeOptionalString(input.scopeId)
                if (!xpertId) {
                    throw new BadRequestException('xpertId is required for xpert workspace file understanding')
                }
                return {
                    volumeScope: {
                        tenantId,
                        catalog,
                        xpertId,
                        userId,
                        isolateByUser: input.isolateByUser ?? false
                    },
                    catalog,
                    scopeId: xpertId
                }
            }
            case 'users': {
                const targetUserId = normalizeOptionalString(input.scopeId) ?? userId
                if (!targetUserId) {
                    throw new BadRequestException('userId is required for user workspace file understanding')
                }
                return {
                    volumeScope: {
                        tenantId,
                        catalog,
                        userId: targetUserId
                    },
                    catalog,
                    scopeId: targetUserId
                }
            }
            case 'knowledges': {
                const knowledgeId = normalizeOptionalString(input.knowledgeId) ?? normalizeOptionalString(input.scopeId)
                if (!knowledgeId) {
                    throw new BadRequestException('knowledgeId is required for knowledge workspace file understanding')
                }
                return {
                    volumeScope: {
                        tenantId,
                        catalog,
                        knowledgeId,
                        userId
                    },
                    catalog,
                    scopeId: knowledgeId
                }
            }
            case 'skills': {
                const rootId = normalizeOptionalString(input.rootId) ?? normalizeOptionalString(input.scopeId)
                if (!rootId) {
                    throw new BadRequestException('rootId is required for skill workspace file understanding')
                }
                return {
                    volumeScope: {
                        tenantId,
                        catalog,
                        rootId,
                        userId
                    },
                    catalog,
                    scopeId: rootId
                }
            }
        }
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

function resolveWorkspaceFileCatalog(input: WorkspaceUnderstandFileInput): WorkspaceFileCatalog {
    const catalog = normalizeOptionalString(input.catalog)
    if (catalog) {
        if (isWorkspaceFileCatalog(catalog)) {
            return catalog
        }
        throw new BadRequestException(`Unsupported workspace file catalog: ${catalog}`)
    }
    if (normalizeOptionalString(input.projectId)) {
        return 'projects'
    }
    if (normalizeOptionalString(input.knowledgeId)) {
        return 'knowledges'
    }
    if (normalizeOptionalString(input.rootId)) {
        return 'skills'
    }
    if (normalizeOptionalString(input.xpertId)) {
        return 'xperts'
    }
    return 'users'
}

function isWorkspaceFileCatalog(value: string): value is WorkspaceFileCatalog {
    return ['projects', 'users', 'knowledges', 'skills', 'xperts'].includes(value)
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

function compactRecord<T extends Record<string, unknown>>(record: T): T {
    return Object.fromEntries(Object.entries(record).filter(([, value]) => value !== undefined && value !== null)) as T
}
