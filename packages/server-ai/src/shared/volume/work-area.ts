import { XpertWorkspaceDataScope } from '@xpert-ai/contracts'
import { Inject, Injectable } from '@nestjs/common'
import { t } from 'i18next'
import path from 'node:path'
import {
    resolveXpertDataVolumeScope,
    VOLUME_CLIENT,
    VolumeClient,
    VolumeHandle,
    VolumeScope,
    WorkspaceBinding
} from './volume'
import { WorkspacePathMapperFactory } from './workspace-path-mapper.factory'
import { XpertWorkAreaExtensionRegistry } from './work-area-extension.registry'

const XPERT_FILE_MEMORY_WORKSPACE_PATH = '.xpert/memory'
const KNOWLEDGE_FILES_PATH = 'files'
const KNOWLEDGE_LEGACY_TMP_PATH = 'tmp'
const KNOWLEDGE_STATE_PATH = '.knowledge'

/** Execution context for storage selection and path mapping; callers retain resource authorization. */
export type XpertRuntimeWorkAreaInput = {
    tenantId: string
    userId: string
    provider?: string | null
    xpertId?: string | null
    projectId?: string | null
    conversationId?: string | null
    /** Selected runtime for path mapping; projectId still takes precedence for storage identity. */
    environmentId?: string | null
    workspaceDataScope?: XpertWorkspaceDataScope | null
}

/** One logical path expressed relative to its volume, on the server and inside the runtime. */
export type XpertRuntimeWorkAreaPath = {
    relativePath: string
    serverPath: string
    workspacePath: string
    publicUrl?: string
}

export type XpertWorkAreaResolveOptions = {
    /** False permits authorization and path lookup only; neither core nor extensions may create files. */
    createDirectories?: boolean
}

/**
 * Storage identity and runtime-visible paths for an execution; sandbox lifecycle is separate.
 * Server and workspace paths address the same files on the backend and inside the runtime.
 */
export type XpertRuntimeWorkArea = {
    volumeScope: VolumeScope
    volume: VolumeHandle
    /** Maps this volume into the runtime; it need not be the runtime's primary mount. */
    workspaceBinding: WorkspaceBinding
    /** Sandbox-visible cwd passed to tools; do not use it directly for backend filesystem I/O. */
    workingDirectory: string
    /** Absolute root of the volume in the backend server's filesystem. */
    volumePath: string
    /** Sandbox-visible root used to map volume-relative file paths. */
    workspaceRoot: string
    /** URL for the default directory, only when the volume exposes direct file URLs. */
    workspaceUrl?: string
    /** Default directory expressed in volume-relative, server and sandbox coordinates. */
    defaultPath: XpertRuntimeWorkAreaPath
    sharedPath?: XpertRuntimeWorkAreaPath
    /** Optional conversation directory; it does not change cwd or isolate project business files. */
    sessionPath?: XpertRuntimeWorkAreaPath
    /** Memory directory, namespaced by Assistant when multiple Assistants share a project volume. */
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
    workspaceUrl?: string
    defaultPath: XpertRuntimeWorkAreaPath
    filesPath: XpertRuntimeWorkAreaPath
    userStagingPath: XpertRuntimeWorkAreaPath
    documentPath?: XpertRuntimeWorkAreaPath
    pipelineRunPath?: XpertRuntimeWorkAreaPath
    tmpPath: XpertRuntimeWorkAreaPath
    legacyTmpPath: XpertRuntimeWorkAreaPath
    statePath: XpertRuntimeWorkAreaPath
}

/**
 * Resolves canonical storage, then delegates runtime mapping to a registered extension.
 * Project storage takes precedence over environment and Assistant scope.
 * Directory creation follows extension authorization; passive discovery never creates files.
 * Callers must authorize access to the supplied scope before resolving it.
 */
@Injectable()
export class XpertWorkAreaResolver {
    constructor(
        @Inject(VOLUME_CLIENT)
        private readonly volumeClient: VolumeClient,
        private readonly workspaceMappers: WorkspacePathMapperFactory,
        private readonly extensions: XpertWorkAreaExtensionRegistry
    ) {}

    /** Creates directories only for active use, after extension authorization succeeds. Never starts a sandbox. */
    async resolve(
        input: XpertRuntimeWorkAreaInput,
        options: XpertWorkAreaResolveOptions = {}
    ): Promise<XpertRuntimeWorkArea> {
        const volumeScope = this.resolveVolumeScope(input)
        const volume = this.volumeClient.resolve(volumeScope)
        const relativePaths = this.resolveRelativePaths(input)
        const workspaceBinding = this.workspaceMappers.mapVolumeToWorkspace(input.provider, volume, {
            serverPath: relativePaths.defaultPath
        })
        const defaultPath = toRuntimePath(volume, workspaceBinding, relativePaths.defaultPath)

        const area: XpertRuntimeWorkArea = {
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
            sessionPath: relativePaths.sessionPath
                ? toRuntimePath(volume, workspaceBinding, relativePaths.sessionPath)
                : undefined,
            memoryPath: relativePaths.memoryPath
                ? toRuntimePath(volume, workspaceBinding, relativePaths.memoryPath)
                : undefined
        }
        const resolved = await this.extensions.resolve(input, area, options)
        if (options.createDirectories !== false) {
            await volume.ensureRoot()
            await this.ensureRelativePaths(volume, relativePaths.allPaths)
        }
        return resolved
    }

    async resolveXpertMemory(input: {
        tenantId: string
        userId: string
        xpertId: string
        workspaceDataScope?: XpertWorkspaceDataScope | null
        provider?: string | null
    }) {
        const volume = await this.volumeClient
            .resolve(
                resolveXpertDataVolumeScope({
                    tenantId: input.tenantId,
                    userId: input.userId,
                    xpertId: input.xpertId,
                    workspaceDataScope: input.workspaceDataScope
                })
            )
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

    /** Project files remain in the project volume even when execution targets a separate environment. */
    private resolveVolumeScope(input: XpertRuntimeWorkAreaInput): VolumeScope {
        if (input.projectId) {
            return {
                tenantId: input.tenantId,
                catalog: 'projects',
                projectId: input.projectId,
                userId: input.userId
            }
        }

        if (input.environmentId) {
            return {
                tenantId: input.tenantId,
                catalog: 'environment',
                environmentId: input.environmentId,
                userId: input.userId
            }
        }

        if (!input.xpertId) {
            throw new Error(
                t('server-ai:Error.XpertWorkAreaXpertRequired', {
                    defaultValue: 'Xpert work area requires xpertId when projectId and environmentId are not provided'
                })
            )
        }

        return resolveXpertDataVolumeScope({
            tenantId: input.tenantId,
            userId: input.userId,
            xpertId: input.xpertId,
            workspaceDataScope: input.workspaceDataScope
        })
    }

    /**
     * Defines POSIX paths within the selected volume without filesystem I/O; an empty path means root.
     * Project business files share that root across Assistants and conversations, while memory is
     * Assistant-scoped and session files use `sessions/<conversationId>` without changing cwd.
     * Environment-only work uses the root; Assistant-only work keeps memory at `.xpert/memory`.
     * allPaths lists directories to ensure after the volume root has been created.
     */
    private resolveRelativePaths(input: XpertRuntimeWorkAreaInput) {
        if (input.projectId) {
            const sharedPath = 'shared'
            const defaultPath = ''
            const sessionPath = input.conversationId ? path.posix.join('sessions', input.conversationId) : undefined
            const memoryPath = input.xpertId
                ? path.posix.join(XPERT_FILE_MEMORY_WORKSPACE_PATH, 'xperts', input.xpertId)
                : undefined
            return {
                defaultPath,
                sharedPath,
                sessionPath,
                memoryPath,
                allPaths: [defaultPath, sharedPath, sessionPath, memoryPath, '.xpert'].filter(isNonEmptyString)
            }
        }

        if (input.environmentId) {
            return {
                defaultPath: '',
                allPaths: ['']
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
        await Promise.all(
            paths.map((relativePath) =>
                VolumeHandle.ensureDirectory(volume.serverRoot, relativePath, volume.serverRoot)
            )
        )
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
        // Normalize the caller-controlled folder before prepending the managed subtree.
        // Otherwise `../tmp` would normalize `files/../tmp` to a sibling of `files`.
        const relativeFolder = normalizeRelativePath(folder ?? undefined)
        return normalizeRelativePath(KNOWLEDGE_FILES_PATH, relativeFolder)
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
        await Promise.all(
            paths.map((relativePath) =>
                VolumeHandle.ensureDirectory(volume.serverRoot, relativePath, volume.serverRoot)
            )
        )
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
        ...(volume.exposesDirectFileUrls() ? { publicUrl: volume.publicUrl(relativePath) } : {})
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
