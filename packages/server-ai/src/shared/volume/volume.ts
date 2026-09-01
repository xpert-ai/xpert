import {
    DEFAULT_XPERT_WORKSPACE_DATA_SCOPE,
    FileUploadVolumeCatalog,
    TFileDirectory,
    XpertWorkspaceDataScope
} from '@xpert-ai/contracts'
import {
    SandboxWorkspaceMapperStrategy,
    type SandboxWorkspaceBinding,
    type SandboxWorkspaceMapper,
    type SandboxWorkspaceMappingOptions
} from '@xpert-ai/plugin-sdk'
import { Injectable } from '@nestjs/common'
import { environment } from '@xpert-ai/server-config'
import { normalizeUploadedFileName, urlJoin } from '@xpert-ai/server-common'
import { constants as fsConstants } from 'fs'
import fsPromises from 'fs/promises'
import { t } from 'i18next'
import path from 'path'
import {
    getApiContainerSandboxVolumeRootPath,
    getDockerHostSandboxVolumeRootPath,
    getLocalSandboxDataRoot,
    hasConfiguredSandboxVolume,
    normalizeSandboxPublicVolumeSubpath,
    runsInsideDockerApiContainer,
    usesFlattenedSandboxVolumeLayout
} from './volume-layout'

/** Platform storage catalogs, including the tenant/Job-isolated Sandbox Runtime workspace. */
export type VolumeCatalog = FileUploadVolumeCatalog | 'workspaces' | 'environment' | 'runtime-jobs'

export type VolumeScope = {
    tenantId: string
    catalog: VolumeCatalog
    environmentId?: string
    knowledgeId?: string
    organizationId?: string | null
    projectId?: string
    rootId?: string
    userId?: string
    workspaceId?: string
    /** Required when `catalog` is `runtime-jobs`; isolates one short-lived execution volume. */
    jobId?: string
    xpertId?: string
    isolateByUser?: boolean
}

export type VolumeRootResolution = {
    serverRoot: string
    hostRoot: string
    /** Trusted platform root used to provision tenant and scoped volume directories. */
    serverProvisioningRoot?: string
}

export type WorkspaceBinding = SandboxWorkspaceBinding
export type WorkspaceMappingOptions = SandboxWorkspaceMappingOptions
export type WorkspacePathMapper = SandboxWorkspaceMapper

export abstract class VolumeClient {
    abstract resolve(scope: VolumeScope): VolumeHandle
    abstract resolveRoot(tenantId: string): VolumeRootResolution

    static getApiContainerSandboxVolumeRoot(tenantId: string) {
        return createRuntimeVolumeClient().resolveRoot(tenantId).serverRoot
    }

    static async getSharedWorkspacePath(tenantId: string, projectId: string | undefined, userId: string) {
        return (
            await createRuntimeVolumeClient()
                .resolve({
                    tenantId,
                    catalog: projectId ? 'projects' : 'users',
                    projectId,
                    userId
                })
                .ensureRoot()
        ).serverRoot
    }

    static getSharedWorkspaceUrl(projectId: string | undefined, userId: string) {
        return getVolumePublicBaseUrl({
            catalog: projectId ? 'projects' : 'users',
            projectId,
            userId
        })
    }

    static async getXpertWorkspacePath(tenantId: string, xpertId: string, userId: string, isolateByUser = true) {
        return (
            await createRuntimeVolumeClient()
                .resolve({
                    tenantId,
                    catalog: 'xperts',
                    xpertId,
                    userId,
                    isolateByUser
                })
                .ensureRoot()
        ).serverRoot
    }

    static getXpertWorkspaceUrl(xpertId: string, userId: string, isolateByUser = true) {
        return getVolumePublicBaseUrl({
            catalog: 'xperts',
            xpertId,
            userId,
            isolateByUser
        })
    }

    static _getWorkspaceRoot(tenantId: string, type: VolumeCatalog | string, id: string) {
        switch (type) {
            case 'environment':
                return createRuntimeVolumeClient().resolve({
                    tenantId,
                    catalog: 'environment',
                    environmentId: id
                }).serverRoot
            case 'knowledges':
                return createRuntimeVolumeClient().resolve({
                    tenantId,
                    catalog: 'knowledges',
                    knowledgeId: id,
                    userId: 'legacy'
                }).serverRoot
            case 'projects':
                return createRuntimeVolumeClient().resolve({
                    tenantId,
                    catalog: 'projects',
                    projectId: id,
                    userId: 'legacy'
                }).serverRoot
            case 'skills':
                return createRuntimeVolumeClient().resolve({
                    tenantId,
                    catalog: 'skills',
                    rootId: id,
                    userId: 'legacy'
                }).serverRoot
            case 'users':
                return createRuntimeVolumeClient().resolve({
                    tenantId,
                    catalog: 'users',
                    userId: id
                }).serverRoot
            case 'workspaces':
                return createRuntimeVolumeClient().resolve({
                    tenantId,
                    catalog: 'workspaces',
                    workspaceId: id
                }).serverRoot
            case 'runtime-jobs':
                return createRuntimeVolumeClient().resolve({
                    tenantId,
                    catalog: 'runtime-jobs',
                    jobId: id
                }).serverRoot
            default:
                return path.join(createRuntimeVolumeClient().resolveRoot(tenantId).serverRoot, type, id)
        }
    }
}

export const VOLUME_CLIENT = Symbol('VOLUME_CLIENT')
export const LOCAL_SHELL_SANDBOX_PROVIDER_TYPE = 'local-shell-sandbox'

function getXpertUserIsolation(isolateByUser?: boolean) {
    return isolateByUser !== false
}

function trimLeadingSlash(value: string) {
    return value.replace(/^\/+/, '')
}

function normalizeRelativePathForVolume(relativePath?: string | null) {
    if (!relativePath) {
        return ''
    }

    const normalized = path.posix.normalize(`${relativePath}`.replace(/\\/g, '/').replace(/^\/+/, ''))
    if (normalized === '.' || !normalized) {
        return ''
    }
    if (normalized.startsWith('..') || path.posix.isAbsolute(normalized)) {
        throw new Error('Invalid relative path')
    }
    return normalized
}

function ensurePathWithinRoot(root: string, candidate: string) {
    const relativePath = path.relative(root, candidate)
    if (relativePath.startsWith('..') || path.isAbsolute(relativePath)) {
        throw new Error('Resolved path is outside of the volume root')
    }
}

export function assertValidVolumeScopeId(value: string, field: string) {
    if (!value || value === '.' || value === '..' || value.includes('\0') || /[\\/]/.test(value)) {
        throw new Error(
            t('server-ai:Error.VolumeScopeIdentifierInvalid', {
                field,
                defaultValue: 'Volume scope identifier {{field}} must be a single path segment'
            })
        )
    }
    return value
}

export function getVolumeSubpath(scope: Omit<VolumeScope, 'tenantId'>) {
    switch (scope.catalog) {
        case 'environment':
            if (!scope.environmentId) {
                throw new Error('environmentId is required for environment volume access')
            }
            return `/environment/${assertValidVolumeScopeId(scope.environmentId, 'environmentId')}`
        case 'knowledges':
            if (!scope.knowledgeId) {
                throw new Error('knowledgeId is required for knowledge volume access')
            }
            return `/knowledges/${assertValidVolumeScopeId(scope.knowledgeId, 'knowledgeId')}`
        case 'projects':
            if (!scope.projectId) {
                throw new Error('projectId is required for project volume access')
            }
            return `/project/${assertValidVolumeScopeId(scope.projectId, 'projectId')}`
        case 'skills':
            if (!scope.rootId) {
                throw new Error('rootId is required for skill volume access')
            }
            return `/skills/${assertValidVolumeScopeId(scope.rootId, 'rootId')}`
        case 'users':
            if (!scope.userId) {
                throw new Error('userId is required for user volume access')
            }
            return `/user/${assertValidVolumeScopeId(scope.userId, 'userId')}`
        case 'workspaces':
            if (!scope.workspaceId) {
                throw new Error('workspaceId is required for workspace volume access')
            }
            return `/workspaces/${assertValidVolumeScopeId(scope.workspaceId, 'workspaceId')}`
        case 'xperts':
            if (!scope.xpertId) {
                throw new Error('xpertId is required for xpert volume access')
            }
            if (!getXpertUserIsolation(scope.isolateByUser)) {
                return `/xpert/${assertValidVolumeScopeId(scope.xpertId, 'xpertId')}`
            }
            if (!scope.userId) {
                throw new Error('userId is required for user-isolated xpert volume access')
            }
            return `/xpert/${assertValidVolumeScopeId(scope.xpertId, 'xpertId')}/user/${assertValidVolumeScopeId(scope.userId, 'userId')}`
        case 'user-xperts':
            if (!scope.userId) {
                throw new Error(
                    t('server-ai:Error.UserXpertVolumeUserRequired', {
                        defaultValue: 'userId is required for user-owned xpert volume access'
                    })
                )
            }
            if (!scope.xpertId) {
                throw new Error(
                    t('server-ai:Error.UserXpertVolumeXpertRequired', {
                        defaultValue: 'xpertId is required for user-owned xpert volume access'
                    })
                )
            }
            return `/user/${assertValidVolumeScopeId(scope.userId, 'userId')}/xpert/${assertValidVolumeScopeId(scope.xpertId, 'xpertId')}`
        case 'runtime-jobs':
            if (!scope.jobId) {
                throw new Error('jobId is required for runtime job volume access')
            }
            return `/runtime-jobs/${assertValidVolumeScopeId(scope.jobId, 'jobId')}`
    }
}

export function getVolumePublicBaseUrl(scope: Omit<VolumeScope, 'tenantId'>) {
    const subpath = trimLeadingSlash(getVolumeSubpath(scope))
    const usesPrivateXpertRoute =
        scope.catalog === 'user-xperts' || (scope.catalog === 'xperts' && getXpertUserIsolation(scope.isolateByUser))
    return urlJoin(
        environment.baseUrl,
        '/api/sandbox/volume',
        usesPrivateXpertRoute ? subpath : normalizeSandboxPublicVolumeSubpath(subpath)
    )
}

export type XpertDataVolumeScope =
    | {
          tenantId: string
          catalog: 'xperts'
          userId?: string | null
          xpertId: string
          isolateByUser: false
      }
    | {
          tenantId: string
          catalog: 'user-xperts'
          userId: string
          xpertId: string
      }

export function resolveXpertDataVolumeScope(input: {
    tenantId: string
    userId?: string | null
    xpertId: string
    workspaceDataScope?: XpertWorkspaceDataScope | null
}): XpertDataVolumeScope {
    if ((input.workspaceDataScope ?? DEFAULT_XPERT_WORKSPACE_DATA_SCOPE) === 'user') {
        if (!input.userId) {
            throw new Error(
                t('server-ai:Error.XpertWorkspaceUserRequired', {
                    defaultValue: 'userId is required for a user-isolated Xpert workspace'
                })
            )
        }
        return {
            tenantId: input.tenantId,
            catalog: 'user-xperts',
            userId: input.userId,
            xpertId: input.xpertId
        }
    }
    return {
        tenantId: input.tenantId,
        catalog: 'xperts',
        ...(input.userId ? { userId: input.userId } : {}),
        xpertId: input.xpertId,
        isolateByUser: false
    }
}

export function getVolumeRootPath(client: VolumeClient, scope: VolumeScope) {
    return client.resolve(scope).serverRoot
}

type TVolumeWriteOptions = {
    boundaryRoot?: string
    encoding?: BufferEncoding
    assertCanWrite?: (canonicalRelativePath: string, fileStat?: { nlink: number }) => void
}

export class VolumeHandle {
    constructor(
        public readonly scope: VolumeScope,
        public readonly serverRoot: string,
        public readonly hostRoot: string,
        public readonly publicBaseUrl: string,
        public readonly serverProvisioningRoot: string = serverRoot
    ) {}

    async ensureRoot() {
        const openedRoot = await this.openOrCreateRoot()
        await openedRoot.fileHandle.close()
        return this
    }

    async writeFile(
        relativePath: string,
        content: string | Uint8Array,
        options?: Omit<TVolumeWriteOptions, 'boundaryRoot'>
    ) {
        const openedRoot = await this.openOrCreateRoot()
        try {
            await VolumeHandle.writeFile(openedRoot.descriptorPath, relativePath, content, {
                ...options,
                boundaryRoot: openedRoot.descriptorPath
            })
        } finally {
            await openedRoot.fileHandle.close()
        }
    }

    private async openOrCreateRoot() {
        ensurePathWithinRoot(this.serverProvisioningRoot, this.serverRoot)
        await fsPromises.mkdir(this.serverProvisioningRoot, { recursive: true })
        return VolumeHandle.openOrCreateDirectory(
            this.serverProvisioningRoot,
            path.relative(this.serverProvisioningRoot, this.serverRoot),
            this.serverProvisioningRoot,
            true
        )
    }

    static resolvePath(root: string, relativePath?: string | null) {
        const normalizedRelativePath = normalizeRelativePathForVolume(relativePath)
        if (!normalizedRelativePath) {
            return root
        }

        const resolvedPath = path.resolve(root, normalizedRelativePath)
        ensurePathWithinRoot(root, resolvedPath)
        return resolvedPath
    }

    static async resolveExistingPath(root: string, relativePath?: string | null) {
        const candidatePath = VolumeHandle.resolvePath(root, relativePath)
        const [canonicalRoot, canonicalCandidate] = await Promise.all([
            fsPromises.realpath(root),
            fsPromises.realpath(candidatePath)
        ])
        ensurePathWithinRoot(canonicalRoot, canonicalCandidate)
        return canonicalCandidate
    }

    static async openExistingFile(
        root: string,
        relativePath?: string | null,
        options?: { boundaryRoot?: string; flags?: number }
    ) {
        const candidatePath = VolumeHandle.resolvePath(root, relativePath)
        const canonicalRoot = await fsPromises.realpath(options?.boundaryRoot ?? root)
        const nonBlock = typeof fsConstants.O_NONBLOCK === 'number' ? fsConstants.O_NONBLOCK : 0
        const fileHandle = await fsPromises.open(candidatePath, (options?.flags ?? fsConstants.O_RDONLY) | nonBlock)

        try {
            const fileStat = await fileHandle.stat()
            let canonicalCandidate: string
            if (process.platform === 'linux') {
                canonicalCandidate = await fsPromises.realpath(`/proc/self/fd/${fileHandle.fd}`)
            } else {
                // Native non-Linux execution is a single-user development fallback; production isolation uses Linux FD paths.
                canonicalCandidate = await fsPromises.realpath(candidatePath)
                const candidateStat = await fsPromises.stat(canonicalCandidate)
                if (candidateStat.dev !== fileStat.dev || candidateStat.ino !== fileStat.ino) {
                    throw new Error('Volume file changed while it was being opened')
                }
            }
            ensurePathWithinRoot(canonicalRoot, canonicalCandidate)
            return {
                fileHandle,
                filePath: canonicalCandidate,
                volumeRelativePath: path.relative(canonicalRoot, canonicalCandidate).replace(/\\/g, '/'),
                fileStat,
                descriptorPath: process.platform === 'linux' ? `/proc/self/fd/${fileHandle.fd}` : canonicalCandidate
            }
        } catch (error) {
            await fileHandle.close()
            throw error
        }
    }

    static async writeFile(
        root: string,
        relativePath: string,
        content: string | Uint8Array,
        options?: TVolumeWriteOptions
    ) {
        const targetPath = VolumeHandle.resolvePath(root, relativePath)
        const parentPath = path.dirname(targetPath)
        await VolumeHandle.ensureDirectory(root, path.relative(root, parentPath), options?.boundaryRoot)

        const openedParent = await VolumeHandle.openExistingFile(parentPath, null, {
            boundaryRoot: options?.boundaryRoot ?? root,
            flags: fsConstants.O_RDONLY | (typeof fsConstants.O_DIRECTORY === 'number' ? fsConstants.O_DIRECTORY : 0)
        })
        try {
            if (!openedParent.fileStat.isDirectory()) {
                throw new Error('Volume file parent is not a directory')
            }
            const canonicalRoot = await fsPromises.realpath(options?.boundaryRoot ?? root)
            const canonicalTargetPath = path.join(openedParent.filePath, path.basename(targetPath))
            ensurePathWithinRoot(canonicalRoot, canonicalTargetPath)
            options?.assertCanWrite?.(path.relative(canonicalRoot, canonicalTargetPath).replace(/\\/g, '/'))
            const anchoredTarget = path.join(openedParent.descriptorPath, path.basename(targetPath))
            const noFollow = typeof fsConstants.O_NOFOLLOW === 'number' ? fsConstants.O_NOFOLLOW : 0
            const nonBlock = typeof fsConstants.O_NONBLOCK === 'number' ? fsConstants.O_NONBLOCK : 0
            const fileHandle = await fsPromises.open(
                anchoredTarget,
                fsConstants.O_WRONLY | fsConstants.O_CREAT | noFollow | nonBlock,
                0o600
            )
            try {
                const fileStat = await fileHandle.stat()
                if (!fileStat.isFile()) {
                    throw new Error('Volume write target is not a regular file')
                }
                if (fileStat.nlink !== 1) {
                    throw new Error('Volume write target must have exactly one hard link')
                }
                const canonicalTarget =
                    process.platform === 'linux'
                        ? await fsPromises.realpath(`/proc/self/fd/${fileHandle.fd}`)
                        : await fsPromises.realpath(anchoredTarget)
                ensurePathWithinRoot(canonicalRoot, canonicalTarget)
                options?.assertCanWrite?.(path.relative(canonicalRoot, canonicalTarget).replace(/\\/g, '/'), fileStat)
                await fileHandle.truncate(0)
                if (options?.encoding && typeof content === 'string') {
                    await fileHandle.writeFile(content, { encoding: options.encoding })
                } else {
                    await fileHandle.writeFile(content)
                }
            } finally {
                await fileHandle.close()
            }
        } finally {
            await openedParent.fileHandle.close()
        }
    }

    static async ensureDirectory(root: string, relativePath?: string | null, boundaryRoot?: string) {
        const openedDirectory = await VolumeHandle.openOrCreateDirectory(root, relativePath, boundaryRoot)
        await openedDirectory.fileHandle.close()
    }

    private static async openOrCreateDirectory(
        root: string,
        relativePath?: string | null,
        boundaryRoot?: string,
        rejectSymlinks = false
    ) {
        const targetPath = VolumeHandle.resolvePath(root, relativePath)
        const relativeDirectory = path.relative(root, targetPath)
        const noFollow = rejectSymlinks && typeof fsConstants.O_NOFOLLOW === 'number' ? fsConstants.O_NOFOLLOW : 0
        let openedDirectory = await VolumeHandle.openExistingFile(root, null, {
            boundaryRoot: boundaryRoot ?? root,
            flags:
                fsConstants.O_RDONLY |
                (typeof fsConstants.O_DIRECTORY === 'number' ? fsConstants.O_DIRECTORY : 0) |
                noFollow
        })
        try {
            if (!openedDirectory.fileStat.isDirectory()) {
                throw new Error('Volume root is not a directory')
            }
            for (const segment of relativeDirectory.split(path.sep).filter(Boolean)) {
                const childPath = path.join(openedDirectory.descriptorPath, segment)
                await fsPromises.mkdir(childPath).catch((error: unknown) => {
                    if (!error || typeof error !== 'object' || !('code' in error) || error.code !== 'EEXIST') {
                        throw error
                    }
                })
                const nextDirectory = await VolumeHandle.openExistingFile(childPath, null, {
                    boundaryRoot: boundaryRoot ?? root,
                    flags:
                        fsConstants.O_RDONLY |
                        (typeof fsConstants.O_DIRECTORY === 'number' ? fsConstants.O_DIRECTORY : 0) |
                        noFollow
                })
                await openedDirectory.fileHandle.close()
                openedDirectory = nextDirectory
                if (!openedDirectory.fileStat.isDirectory()) {
                    throw new Error('Volume path component is not a directory')
                }
            }
            return openedDirectory
        } catch (error) {
            await openedDirectory.fileHandle.close()
            throw error
        }
    }

    static async removePath(
        root: string,
        relativePath: string,
        options?: {
            boundaryRoot?: string
            assertCanRemove?: (canonicalRelativePath: string) => void
        }
    ) {
        const targetPath = VolumeHandle.resolvePath(root, relativePath)
        const parentPath = path.dirname(targetPath)
        const openedParent = await VolumeHandle.openExistingFile(parentPath, null, {
            boundaryRoot: options?.boundaryRoot ?? root,
            flags: fsConstants.O_RDONLY | (typeof fsConstants.O_DIRECTORY === 'number' ? fsConstants.O_DIRECTORY : 0)
        })
        try {
            if (!openedParent.fileStat.isDirectory()) {
                throw new Error('Volume file parent is not a directory')
            }
            const canonicalRoot = await fsPromises.realpath(options?.boundaryRoot ?? root)
            const canonicalTargetPath = path.join(openedParent.filePath, path.basename(targetPath))
            ensurePathWithinRoot(canonicalRoot, canonicalTargetPath)
            options?.assertCanRemove?.(path.relative(canonicalRoot, canonicalTargetPath).replace(/\\/g, '/'))
            const anchoredTarget = path.join(openedParent.descriptorPath, path.basename(targetPath))
            const targetStat = await fsPromises.lstat(anchoredTarget)
            if (targetStat.isDirectory() && !targetStat.isSymbolicLink()) {
                await fsPromises.rm(anchoredTarget, { recursive: true, force: true })
            } else {
                await fsPromises.unlink(anchoredTarget)
            }
        } finally {
            await openedParent.fileHandle.close()
        }
    }

    path(relativePath?: string | null) {
        return VolumeHandle.resolvePath(this.serverRoot, relativePath)
    }

    publicUrl(relativePath?: string | null) {
        const normalizedRelativePath = normalizeRelativePathForVolume(relativePath)
        return normalizedRelativePath ? urlJoin(this.publicBaseUrl, normalizedRelativePath) : this.publicBaseUrl
    }

    exposesDirectFileUrls() {
        return (
            this.scope.catalog !== 'projects' &&
            this.scope.catalog !== 'user-xperts' &&
            !(this.scope.catalog === 'xperts' && getXpertUserIsolation(this.scope.isolateByUser))
        )
    }

    async putFile(folder = '', file: { originalname: string; buffer: Buffer; mimetype?: string }): Promise<string> {
        const normalizedFolder = normalizeRelativePathForVolume(folder)
        const fileName = normalizeUploadedFileName(file.originalname)

        const publicRelativePath = path.posix.join(normalizedFolder, fileName)
        await VolumeHandle.writeFile(this.serverRoot, publicRelativePath, file.buffer)
        return this.publicUrl(publicRelativePath)
    }

    async readFile(filePath: string) {
        const openedFile = await VolumeHandle.openExistingFile(this.serverRoot, filePath)
        try {
            if (!openedFile.fileStat.isFile()) {
                throw new Error('Volume path is not a file')
            }
            return await openedFile.fileHandle.readFile('utf-8')
        } finally {
            await openedFile.fileHandle.close()
        }
    }

    async deleteFile(filePath: string): Promise<void> {
        try {
            if (!normalizeRelativePathForVolume(filePath)) {
                await fsPromises.rm(this.serverRoot, { recursive: true, force: true })
                return
            }
            await VolumeHandle.removePath(this.serverRoot, filePath)
        } catch (error: unknown) {
            if (!(error instanceof Error) || !('code' in error) || error.code !== 'ENOENT') {
                throw error
            }
        }
    }

    async list(params: { path?: string; deepth?: number }) {
        const files = await listVolumeFiles(this.serverRoot, params.path, {
            baseUrl: this.publicBaseUrl,
            boundaryRoot: this.serverRoot,
            depth: params.deepth ?? 1
        })
        return this.exposesDirectFileUrls() ? files : omitVolumeDirectFileUrls(files)
    }
}

function omitVolumeDirectFileUrls(files: TFileDirectory[]): TFileDirectory[] {
    return files.map(({ url: _url, fileUrl: _fileUrl, children, ...file }) => ({
        ...file,
        ...(children ? { children: omitVolumeDirectFileUrls(children) } : {})
    }))
}

type TOpenedVolumePath = Awaited<ReturnType<typeof VolumeHandle.openExistingFile>>

export async function listVolumeFiles(
    root: string,
    relativePath: string | null | undefined,
    options: { baseUrl: string; boundaryRoot: string; depth: number }
): Promise<TFileDirectory[]> {
    const normalizedPath = normalizeRelativePathForVolume(relativePath)
    const openedRoot = await VolumeHandle.openExistingFile(root, normalizedPath, {
        boundaryRoot: options.boundaryRoot,
        flags: fsConstants.O_RDONLY | (typeof fsConstants.O_DIRECTORY === 'number' ? fsConstants.O_DIRECTORY : 0)
    })
    try {
        if (!openedRoot.fileStat.isDirectory()) {
            return []
        }
        return (await listOpenedVolumeDirectory(openedRoot, normalizedPath, options, 0)) ?? []
    } finally {
        await openedRoot.fileHandle.close()
    }
}

async function listOpenedVolumeDirectory(
    openedDirectory: TOpenedVolumePath,
    logicalDirectory: string,
    options: { baseUrl: string; boundaryRoot: string; depth: number },
    currentDepth: number
): Promise<TFileDirectory[] | null> {
    if (currentDepth >= options.depth) {
        return null
    }

    const entries = await fsPromises.readdir(openedDirectory.descriptorPath, { withFileTypes: true })
    const files: TFileDirectory[] = []
    for (const entry of entries) {
        if (entry.isSymbolicLink()) {
            continue
        }

        let openedEntry: TOpenedVolumePath | null = null
        try {
            openedEntry = await VolumeHandle.openExistingFile(openedDirectory.descriptorPath, entry.name, {
                boundaryRoot: options.boundaryRoot,
                flags: entry.isDirectory()
                    ? fsConstants.O_RDONLY | (typeof fsConstants.O_DIRECTORY === 'number' ? fsConstants.O_DIRECTORY : 0)
                    : fsConstants.O_RDONLY
            })
            const fullPath = path.posix.join(logicalDirectory, entry.name)
            if (openedEntry.fileStat.isDirectory()) {
                const children = await listOpenedVolumeDirectory(openedEntry, fullPath, options, currentDepth + 1)
                files.push({
                    filePath: entry.name,
                    fullPath,
                    directory: logicalDirectory || '/',
                    fileType: 'directory',
                    hasChildren: true,
                    children,
                    size: 0,
                    createdAt: openedEntry.fileStat.mtime,
                    updatedAt: openedEntry.fileStat.mtime
                } as TFileDirectory)
            } else if (openedEntry.fileStat.isFile()) {
                files.push({
                    filePath: entry.name,
                    fullPath,
                    directory: logicalDirectory || '/',
                    fileType: path.extname(entry.name).slice(1),
                    hasChildren: false,
                    size: openedEntry.fileStat.size,
                    createdAt: openedEntry.fileStat.birthtime,
                    updatedAt: openedEntry.fileStat.mtime,
                    url: urlJoin(options.baseUrl, fullPath)
                } as TFileDirectory)
            }
        } catch {
            continue
        } finally {
            await openedEntry?.fileHandle.close()
        }
    }
    return files
}

abstract class BaseRuntimeVolumeClient extends VolumeClient {
    abstract resolveRoot(tenantId: string): VolumeRootResolution

    resolve(scope: VolumeScope): VolumeHandle {
        const { tenantId, ...subscope } = scope
        const roots = this.resolveRoot(assertValidVolumeScopeId(tenantId, 'tenantId'))
        const subpath = getVolumeSubpath(subscope)
        const flattened = usesFlattenedSandboxVolumeLayout()
        // The explicit legacy-flat dev layout keeps existing durable catalogs
        // directly under ~/data. Runtime jobs still need a deletable subtree,
        // while private Xpert scopes retain their isolation contract.
        const isolateCatalog =
            flattened &&
            (scope.catalog === 'runtime-jobs' ||
                scope.catalog === 'user-xperts' ||
                (scope.catalog === 'xperts' && getXpertUserIsolation(scope.isolateByUser)))

        return new VolumeHandle(
            scope,
            flattened && !isolateCatalog ? roots.serverRoot : path.join(roots.serverRoot, trimLeadingSlash(subpath)),
            flattened && !isolateCatalog ? roots.hostRoot : path.join(roots.hostRoot, trimLeadingSlash(subpath)),
            getVolumePublicBaseUrl(subscope),
            roots.serverProvisioningRoot ?? roots.serverRoot
        )
    }
}

export class DevVolumeClient extends BaseRuntimeVolumeClient {
    resolveRoot(tenantId: string): VolumeRootResolution {
        tenantId = assertValidVolumeScopeId(tenantId, 'tenantId')
        if (usesFlattenedSandboxVolumeLayout()) {
            const localRoot = getLocalSandboxDataRoot()
            return {
                serverRoot: localRoot,
                hostRoot: localRoot,
                serverProvisioningRoot: localRoot
            }
        }

        const serverProvisioningRoot = hasConfiguredSandboxVolume()
            ? getDockerHostSandboxVolumeRootPath()
            : getLocalSandboxDataRoot()
        const resolvedRoot = hasConfiguredSandboxVolume()
            ? getDockerHostSandboxVolumeRootPath(tenantId)
            : path.join(getLocalSandboxDataRoot(), tenantId)
        return {
            serverRoot: resolvedRoot,
            hostRoot: resolvedRoot,
            serverProvisioningRoot
        }
    }
}

export class DockerVolumeClient extends BaseRuntimeVolumeClient {
    resolveRoot(tenantId: string): VolumeRootResolution {
        tenantId = assertValidVolumeScopeId(tenantId, 'tenantId')
        return {
            serverRoot: getApiContainerSandboxVolumeRootPath(tenantId),
            hostRoot: getDockerHostSandboxVolumeRootPath(tenantId),
            serverProvisioningRoot: getApiContainerSandboxVolumeRootPath()
        }
    }
}

/** Identity mapper used only by local interactive sandboxes, never as a Sandbox Job Provider. */
@Injectable()
@SandboxWorkspaceMapperStrategy(LOCAL_SHELL_SANDBOX_PROVIDER_TYPE)
export class LocalShellWorkspacePathMapper implements WorkspacePathMapper {
    mapVolumeToWorkspace(
        volume: { serverRoot: string; hostRoot: string },
        options?: WorkspaceMappingOptions
    ): WorkspaceBinding {
        const serverPath = options?.serverPath ?? volume.serverRoot
        return {
            volumeRoot: volume.serverRoot,
            workspaceRoot: volume.serverRoot,
            workspacePath: serverPath
        }
    }

    mapWorkspaceToVolume(binding: WorkspaceBinding, workspacePath: string): string {
        const normalizedPath = path.resolve(workspacePath)
        const workspaceRoot = path.resolve(binding.workspaceRoot)
        ensurePathWithinRoot(workspaceRoot, normalizedPath)
        return normalizedPath
    }
}

export function createRuntimeVolumeClient(): VolumeClient {
    return runsInsideDockerApiContainer() ? new DockerVolumeClient() : new DevVolumeClient()
}

export function resolveRuntimeVolume(scope: VolumeScope) {
    return createRuntimeVolumeClient().resolve(scope)
}
