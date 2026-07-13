import { Inject, Injectable } from '@nestjs/common'
import fsPromises from 'node:fs/promises'
import path from 'node:path'
import { VOLUME_CLIENT, VolumeClient, VolumeHandle, VolumeScope, WorkspaceBinding } from './volume'
import { WorkspacePathMapperFactory } from './volume.module'

const XPERT_FILE_MEMORY_WORKSPACE_PATH = '.xpert/memory'
const KNOWLEDGE_FILES_PATH = 'files'
const KNOWLEDGE_LEGACY_TMP_PATH = 'tmp'
const KNOWLEDGE_STATE_PATH = '.knowledge'

export type XpertRuntimeWorkAreaInput = {
    tenantId: string
    userId: string
    provider?: string | null
    xpertId?: string | null
    projectId?: string | null
    conversationId?: string | null
    environmentId?: string | null
}

export type XpertRuntimeWorkAreaPath = {
    relativePath: string
    serverPath: string
    workspacePath: string
    publicUrl: string
}

export type XpertRuntimeWorkArea = {
    volumeScope: VolumeScope
    volume: VolumeHandle
    workspaceBinding: WorkspaceBinding
    workingDirectory: string
    volumePath: string
    workspaceRoot: string
    workspaceUrl: string
    defaultPath: XpertRuntimeWorkAreaPath
    sharedPath?: XpertRuntimeWorkAreaPath
    agentPath?: XpertRuntimeWorkAreaPath
    sessionPath?: XpertRuntimeWorkAreaPath
    memoryPath?: XpertRuntimeWorkAreaPath
}

export type KnowledgeRuntimeWorkAreaInput = {
    tenantId: string
    userId: string
    knowledgebaseId: string
    provider?: string | null
    taskId?: string | null
    documentId?: string | null
}

export type KnowledgeRuntimeWorkArea = {
    volumeScope: VolumeScope
    volume: VolumeHandle
    workspaceBinding: WorkspaceBinding
    workingDirectory: string
    volumePath: string
    workspaceRoot: string
    workspaceUrl: string
    defaultPath: XpertRuntimeWorkAreaPath
    filesPath: XpertRuntimeWorkAreaPath
    userStagingPath: XpertRuntimeWorkAreaPath
    documentPath?: XpertRuntimeWorkAreaPath
    pipelineRunPath?: XpertRuntimeWorkAreaPath
    tmpPath: XpertRuntimeWorkAreaPath
    legacyTmpPath: XpertRuntimeWorkAreaPath
    statePath: XpertRuntimeWorkAreaPath
}

@Injectable()
export class XpertWorkAreaResolver {
    constructor(
        @Inject(VOLUME_CLIENT)
        private readonly volumeClient: VolumeClient,
        private readonly workspaceMappers: WorkspacePathMapperFactory
    ) {}

    async resolve(input: XpertRuntimeWorkAreaInput): Promise<XpertRuntimeWorkArea> {
        const volumeScope = this.resolveVolumeScope(input)
        const volume = await this.volumeClient.resolve(volumeScope).ensureRoot()
        const relativePaths = this.resolveRelativePaths(input)
        await this.ensureRelativePaths(volume, relativePaths.allPaths)

        const workspaceBinding = this.workspaceMappers.mapVolumeToWorkspace(input.provider, volume, {
            serverPath: relativePaths.defaultPath
        })
        const defaultPath = toRuntimePath(volume, workspaceBinding, relativePaths.defaultPath)

        return {
            volumeScope,
            volume,
            workspaceBinding,
            workingDirectory: workspaceBinding.workspacePath,
            volumePath: volume.serverRoot,
            workspaceRoot: workspaceBinding.workspaceRoot,
            workspaceUrl: defaultPath.publicUrl,
            defaultPath,
            sharedPath: relativePaths.sharedPath
                ? toRuntimePath(volume, workspaceBinding, relativePaths.sharedPath)
                : undefined,
            agentPath: relativePaths.agentPath
                ? toRuntimePath(volume, workspaceBinding, relativePaths.agentPath)
                : undefined,
            sessionPath: relativePaths.sessionPath
                ? toRuntimePath(volume, workspaceBinding, relativePaths.sessionPath)
                : undefined,
            memoryPath: relativePaths.memoryPath
                ? toRuntimePath(volume, workspaceBinding, relativePaths.memoryPath)
                : undefined
        }
    }

    async resolveXpertMemory(input: { tenantId: string; xpertId: string; provider?: string | null }) {
        const volume = await this.volumeClient
            .resolve({
                tenantId: input.tenantId,
                catalog: 'xperts',
                xpertId: input.xpertId,
                isolateByUser: false
            })
            .ensureRoot()
        const memoryPath = XPERT_FILE_MEMORY_WORKSPACE_PATH
        await this.ensureRelativePaths(volume, [memoryPath])
        const workspaceBinding = this.workspaceMappers.mapVolumeToWorkspace(input.provider, volume, {
            serverPath: memoryPath
        })
        return {
            volume,
            workspaceBinding,
            memoryPath: toRuntimePath(volume, workspaceBinding, memoryPath)
        }
    }

    private resolveVolumeScope(input: XpertRuntimeWorkAreaInput): VolumeScope {
        if (input.environmentId) {
            return {
                tenantId: input.tenantId,
                catalog: 'environment',
                environmentId: input.environmentId,
                userId: input.userId
            }
        }

        if (input.projectId) {
            return {
                tenantId: input.tenantId,
                catalog: 'projects',
                projectId: input.projectId,
                userId: input.userId
            }
        }

        if (!input.xpertId) {
            throw new Error('Xpert work area requires xpertId when projectId and environmentId are not provided')
        }

        return {
            tenantId: input.tenantId,
            catalog: 'xperts',
            xpertId: input.xpertId,
            userId: input.userId,
            isolateByUser: false
        }
    }

    private resolveRelativePaths(input: XpertRuntimeWorkAreaInput) {
        if (input.environmentId) {
            return {
                defaultPath: '',
                allPaths: ['']
            }
        }

        if (input.projectId) {
            const defaultPath = ''
            const sharedPath = 'shared'
            const agentPath = input.xpertId ? path.posix.join('agents', input.xpertId) : undefined
            const sessionPath = input.conversationId ? path.posix.join('sessions', input.conversationId) : undefined
            return {
                defaultPath,
                sharedPath,
                agentPath,
                sessionPath,
                allPaths: [defaultPath, sharedPath, agentPath, sessionPath, '.xpert'].filter(isNonEmptyString)
            }
        }

        const defaultPath = ''
        const sharedPath = 'shared'
        const sessionPath = input.conversationId ? path.posix.join('sessions', input.conversationId) : undefined
        const memoryPath = XPERT_FILE_MEMORY_WORKSPACE_PATH
        return {
            defaultPath,
            sharedPath,
            sessionPath,
            memoryPath,
            allPaths: [defaultPath, sharedPath, sessionPath, memoryPath, '.xpert'].filter(isNonEmptyString)
        }
    }

    private async ensureRelativePaths(volume: VolumeHandle, paths: string[]) {
        await Promise.all(paths.map((relativePath) => fsPromises.mkdir(volume.path(relativePath), { recursive: true })))
    }
}

@Injectable()
export class KnowledgeWorkAreaResolver {
    constructor(
        @Inject(VOLUME_CLIENT)
        private readonly volumeClient: VolumeClient,
        private readonly workspaceMappers: WorkspacePathMapperFactory
    ) {}

    async resolve(input: KnowledgeRuntimeWorkAreaInput): Promise<KnowledgeRuntimeWorkArea> {
        const volumeScope: VolumeScope = {
            tenantId: input.tenantId,
            catalog: 'knowledges',
            knowledgeId: input.knowledgebaseId,
            userId: input.userId
        }
        const volume = await this.volumeClient.resolve(volumeScope).ensureRoot()
        const relativePaths = this.resolveRelativePaths(input)
        await this.ensureRelativePaths(volume, relativePaths.allPaths)

        const workspaceBinding = this.workspaceMappers.mapVolumeToWorkspace(input.provider, volume, {
            serverPath: relativePaths.defaultPath
        })
        const defaultPath = toRuntimePath(volume, workspaceBinding, relativePaths.defaultPath)

        return {
            volumeScope,
            volume,
            workspaceBinding,
            workingDirectory: workspaceBinding.workspacePath,
            volumePath: volume.serverRoot,
            workspaceRoot: workspaceBinding.workspaceRoot,
            workspaceUrl: defaultPath.publicUrl,
            defaultPath,
            filesPath: toRuntimePath(volume, workspaceBinding, relativePaths.filesPath),
            userStagingPath: toRuntimePath(volume, workspaceBinding, relativePaths.userStagingPath),
            documentPath: relativePaths.documentPath
                ? toRuntimePath(volume, workspaceBinding, relativePaths.documentPath)
                : undefined,
            pipelineRunPath: relativePaths.pipelineRunPath
                ? toRuntimePath(volume, workspaceBinding, relativePaths.pipelineRunPath)
                : undefined,
            tmpPath: toRuntimePath(volume, workspaceBinding, relativePaths.tmpPath),
            legacyTmpPath: toRuntimePath(volume, workspaceBinding, relativePaths.legacyTmpPath),
            statePath: toRuntimePath(volume, workspaceBinding, relativePaths.statePath)
        }
    }

    getFilesPath(folder?: string | null) {
        return normalizeRelativePath(KNOWLEDGE_FILES_PATH, folder ?? undefined)
    }

    getUserStagingPath(userId: string) {
        return normalizeRelativePath('users', userId, 'staging')
    }

    getDocumentPath(documentId: string) {
        return normalizeRelativePath('documents', documentId)
    }

    getPipelineRunPath(taskId: string) {
        return normalizeRelativePath('pipeline', 'runs', taskId)
    }

    private resolveRelativePaths(input: KnowledgeRuntimeWorkAreaInput) {
        const filesPath = KNOWLEDGE_FILES_PATH
        const userStagingPath = this.getUserStagingPath(input.userId)
        const documentPath = input.documentId ? this.getDocumentPath(input.documentId) : undefined
        const pipelineRunPath = input.taskId ? this.getPipelineRunPath(input.taskId) : undefined
        const defaultPath = pipelineRunPath ?? documentPath ?? ''
        const tmpPath = pipelineRunPath
            ? path.posix.join(pipelineRunPath, 'tmp')
            : documentPath
              ? path.posix.join(documentPath, 'tmp')
              : KNOWLEDGE_LEGACY_TMP_PATH
        const legacyTmpPath = KNOWLEDGE_LEGACY_TMP_PATH
        const statePath = KNOWLEDGE_STATE_PATH

        return {
            defaultPath,
            filesPath,
            userStagingPath,
            documentPath,
            pipelineRunPath,
            tmpPath,
            legacyTmpPath,
            statePath,
            allPaths: [
                defaultPath,
                filesPath,
                userStagingPath,
                documentPath,
                pipelineRunPath,
                tmpPath,
                legacyTmpPath,
                statePath
            ].filter(isNonEmptyString)
        }
    }

    private async ensureRelativePaths(volume: VolumeHandle, paths: string[]) {
        await Promise.all(paths.map((relativePath) => fsPromises.mkdir(volume.path(relativePath), { recursive: true })))
    }
}

function mapServerPathToWorkspacePath(workspaceBinding: WorkspaceBinding, serverPath: string) {
    const relativePath = path.relative(workspaceBinding.volumeRoot, serverPath).replace(/\\/g, '/')
    if (!relativePath || relativePath === '.') {
        return workspaceBinding.workspaceRoot
    }
    return path.posix.join(workspaceBinding.workspaceRoot, relativePath)
}

function isNonEmptyString(value: string | undefined): value is string {
    return typeof value === 'string' && value.length > 0
}

function toRuntimePath(
    volume: VolumeHandle,
    workspaceBinding: WorkspaceBinding,
    relativePath: string
): XpertRuntimeWorkAreaPath {
    const serverPath = volume.path(relativePath)
    return {
        relativePath,
        serverPath,
        workspacePath: mapServerPathToWorkspacePath(workspaceBinding, serverPath),
        publicUrl: volume.publicUrl(relativePath)
    }
}

function normalizeRelativePath(...segments: Array<string | undefined>) {
    const relativePath = path.posix
        .join(...segments.filter(isNonEmptyString).map((segment) => segment.replace(/\\/g, '/')))
        .replace(/^\/+/, '')
    const normalized = path.posix.normalize(relativePath)
    if (normalized.startsWith('..')) {
        throw new Error('Invalid relative path')
    }
    return normalized === '.' ? '' : normalized
}
