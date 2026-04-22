import { FileUploadVolumeCatalog } from '@xpert-ai/contracts'
import { environment } from '@xpert-ai/server-config'
import { normalizeUploadedFileName, urlJoin } from '@xpert-ai/server-common'
import fsPromises from 'fs/promises'
import path from 'path'
import { listFiles } from '../utils'
import {
    getApiContainerSandboxVolumeRootPath,
    getDockerHostSandboxVolumeRootPath,
    getLocalSandboxDataRoot,
    hasConfiguredSandboxVolume,
    normalizeSandboxPublicVolumeSubpath,
    runsInsideDockerApiContainer,
    usesFlattenedSandboxVolumeLayout
} from './volume-layout'

export type VolumeCatalog = FileUploadVolumeCatalog | 'workspaces' | 'environment'

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
    xpertId?: string
    isolateByUser?: boolean
}

export type VolumeRootResolution = {
    serverRoot: string
    hostRoot: string
}

export type WorkspaceBinding = {
    bindSource?: string
    containerMountPath?: string
    volumeRoot: string
    workspacePath: string
    workspaceRoot: string
}

export type WorkspaceMappingOptions = {
    serverPath?: string
}

export interface WorkspacePathMapper {
    mapVolumeToWorkspace(volume: VolumeHandle, options?: WorkspaceMappingOptions): WorkspaceBinding
    mapWorkspaceToVolume(binding: WorkspaceBinding, workspacePath: string): string
}

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
            default:
                return path.join(createRuntimeVolumeClient().resolveRoot(tenantId).serverRoot, type, id)
        }
    }
}

export const VOLUME_CLIENT = Symbol('VOLUME_CLIENT')
const DOCKER_SANDBOX_PROVIDER_TYPE = 'docker-sandbox'

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

export function getVolumeSubpath(scope: Omit<VolumeScope, 'tenantId'>) {
    switch (scope.catalog) {
        case 'environment':
            if (!scope.environmentId) {
                throw new Error('environmentId is required for environment volume access')
            }
            return `/environment/${scope.environmentId}`
        case 'knowledges':
            if (!scope.knowledgeId) {
                throw new Error('knowledgeId is required for knowledge volume access')
            }
            return `/knowledges/${scope.knowledgeId}`
        case 'projects':
            if (!scope.projectId) {
                throw new Error('projectId is required for project volume access')
            }
            return `/project/${scope.projectId}`
        case 'skills':
            if (!scope.rootId) {
                throw new Error('rootId is required for skill volume access')
            }
            return `/skills/${scope.rootId}`
        case 'users':
            if (!scope.userId) {
                throw new Error('userId is required for user volume access')
            }
            return `/user/${scope.userId}`
        case 'workspaces':
            if (!scope.workspaceId) {
                throw new Error('workspaceId is required for workspace volume access')
            }
            return `/workspaces/${scope.workspaceId}`
        case 'xperts':
            if (!scope.xpertId) {
                throw new Error('xpertId is required for xpert volume access')
            }
            if (!getXpertUserIsolation(scope.isolateByUser)) {
                return `/xpert/${scope.xpertId}`
            }
            if (!scope.userId) {
                throw new Error('userId is required for user-isolated xpert volume access')
            }
            return `/xpert/${scope.xpertId}/user/${scope.userId}`
    }
}

export function getVolumePublicBaseUrl(scope: Omit<VolumeScope, 'tenantId'>) {
    return urlJoin(
        environment.baseUrl,
        '/api/sandbox/volume',
        normalizeSandboxPublicVolumeSubpath(trimLeadingSlash(getVolumeSubpath(scope)))
    )
}

export function getVolumeRootPath(client: VolumeClient, scope: VolumeScope) {
    return client.resolve(scope).serverRoot
}

export class VolumeHandle {
    constructor(
        public readonly scope: VolumeScope,
        public readonly serverRoot: string,
        public readonly hostRoot: string,
        public readonly publicBaseUrl: string
    ) {}

    async ensureRoot() {
        await fsPromises.mkdir(this.serverRoot, { recursive: true })
        return this
    }

    path(relativePath?: string | null) {
        const normalizedRelativePath = normalizeRelativePathForVolume(relativePath)
        if (!normalizedRelativePath) {
            return this.serverRoot
        }

        const resolvedPath = path.resolve(this.serverRoot, normalizedRelativePath)
        ensurePathWithinRoot(this.serverRoot, resolvedPath)
        return resolvedPath
    }

    publicUrl(relativePath?: string | null) {
        const normalizedRelativePath = normalizeRelativePathForVolume(relativePath)
        return normalizedRelativePath ? urlJoin(this.publicBaseUrl, normalizedRelativePath) : this.publicBaseUrl
    }

    async putFile(
        folder = '',
        file: { originalname: string; buffer: Buffer; mimetype?: string }
    ): Promise<string> {
        const normalizedFolder = normalizeRelativePathForVolume(folder)
        const fileName = normalizeUploadedFileName(file.originalname)

        const targetFolder = this.path(normalizedFolder)
        const filePath = path.join(targetFolder, fileName)
        await fsPromises.mkdir(targetFolder, { recursive: true })
        await fsPromises.writeFile(filePath, file.buffer)
        const publicRelativePath = path.posix.join(normalizedFolder, fileName)
        return this.publicUrl(publicRelativePath)
    }

    async readFile(filePath: string) {
        return await fsPromises.readFile(this.path(filePath), 'utf-8')
    }

    async deleteFile(filePath: string): Promise<void> {
        const fullPath = this.path(filePath)
        try {
            const stat = await fsPromises.stat(fullPath)
            if (stat.isDirectory()) {
                await fsPromises.rm(fullPath, { recursive: true, force: true })
            } else {
                await fsPromises.unlink(fullPath)
            }
        } catch (error: unknown) {
            if (!(error instanceof Error) || !('code' in error) || error.code !== 'ENOENT') {
                throw error
            }
        }
    }

    async list(params: { path?: string; deepth?: number }) {
        return await listFiles(params.path || '/', params.deepth ?? 1, 0, {
            root: this.serverRoot,
            baseUrl: this.publicBaseUrl
        })
    }
}

abstract class BaseRuntimeVolumeClient extends VolumeClient {
    abstract resolveRoot(tenantId: string): VolumeRootResolution

    resolve(scope: VolumeScope): VolumeHandle {
        const { tenantId, ...subscope } = scope
        const roots = this.resolveRoot(tenantId)
        const subpath = getVolumeSubpath(subscope)
        const flattened = usesFlattenedSandboxVolumeLayout()

        return new VolumeHandle(
            scope,
            flattened ? roots.serverRoot : path.join(roots.serverRoot, trimLeadingSlash(subpath)),
            flattened ? roots.hostRoot : path.join(roots.hostRoot, trimLeadingSlash(subpath)),
            getVolumePublicBaseUrl(subscope)
        )
    }
}

export class DevVolumeClient extends BaseRuntimeVolumeClient {
    resolveRoot(tenantId: string): VolumeRootResolution {
        if (usesFlattenedSandboxVolumeLayout()) {
            const localRoot = getLocalSandboxDataRoot()
            return {
                serverRoot: localRoot,
                hostRoot: localRoot
            }
        }

        const resolvedRoot = hasConfiguredSandboxVolume()
            ? getDockerHostSandboxVolumeRootPath(tenantId)
            : path.join(getLocalSandboxDataRoot(), tenantId)
        return {
            serverRoot: resolvedRoot,
            hostRoot: resolvedRoot
        }
    }
}

export class DockerVolumeClient extends BaseRuntimeVolumeClient {
    resolveRoot(tenantId: string): VolumeRootResolution {
        return {
            serverRoot: getApiContainerSandboxVolumeRootPath(tenantId),
            hostRoot: getDockerHostSandboxVolumeRootPath(tenantId)
        }
    }
}

export class LocalShellWorkspacePathMapper implements WorkspacePathMapper {
    mapVolumeToWorkspace(volume: VolumeHandle, options?: WorkspaceMappingOptions): WorkspaceBinding {
        const serverPath = options?.serverPath ? volume.path(options.serverPath) : volume.serverRoot
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

export class DockerWorkspacePathMapper implements WorkspacePathMapper {
    mapVolumeToWorkspace(volume: VolumeHandle, options?: WorkspaceMappingOptions): WorkspaceBinding {
        const workspaceRoot = '/workspace'
        const serverPath = options?.serverPath ? volume.path(options.serverPath) : volume.serverRoot
        const relativePath = path.relative(volume.serverRoot, serverPath).replace(/\\/g, '/')
        if (relativePath.startsWith('..') || path.posix.isAbsolute(relativePath)) {
            throw new Error('Resolved workspace path is outside of the mapped volume root')
        }

        return {
            bindSource: volume.hostRoot,
            containerMountPath: workspaceRoot,
            volumeRoot: volume.serverRoot,
            workspaceRoot,
            workspacePath:
                relativePath && relativePath !== '.'
                    ? path.posix.join(workspaceRoot, relativePath)
                    : workspaceRoot
        }
    }

    mapWorkspaceToVolume(binding: WorkspaceBinding, workspacePath: string): string {
        const normalizedWorkspaceRoot = path.posix.normalize(binding.workspaceRoot)
        const normalizedWorkspacePath = path.posix.normalize(workspacePath)
        const relativePath = path.posix.relative(normalizedWorkspaceRoot, normalizedWorkspacePath)
        if (relativePath.startsWith('..') || path.posix.isAbsolute(relativePath)) {
            throw new Error('Resolved workspace path is outside of the mounted workspace root')
        }

        return relativePath && relativePath !== '.'
            ? path.join(binding.volumeRoot, relativePath)
            : binding.volumeRoot
    }
}

export function createRuntimeVolumeClient(): VolumeClient {
    return runsInsideDockerApiContainer() ? new DockerVolumeClient() : new DevVolumeClient()
}

export function getWorkspacePathMapperForProvider(provider?: string | null): WorkspacePathMapper {
    return provider === DOCKER_SANDBOX_PROVIDER_TYPE ? new DockerWorkspacePathMapper() : new LocalShellWorkspacePathMapper()
}

export function resolveRuntimeVolume(scope: VolumeScope) {
    return createRuntimeVolumeClient().resolve(scope)
}

export function resolveRuntimeWorkspaceBinding(
    provider: string | null | undefined,
    scope: VolumeScope,
    options?: WorkspaceMappingOptions
) {
    return getWorkspacePathMapperForProvider(provider).mapVolumeToWorkspace(resolveRuntimeVolume(scope), options)
}
