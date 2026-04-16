import { urlJoin } from '@xpert-ai/server-common'
import { FileUploadVolumeCatalog } from '@xpert-ai/contracts'
import fsPromises from 'fs/promises'
import path, { join } from 'path'
import { getWorkspace, listFiles, sandboxVolume, sandboxVolumeUrl } from '../utils'
import { getApiContainerSandboxVolumeRootPath, usesFlattenedSandboxVolumeLayout } from './volume-layout'

type TVolumeScope = {
    catalog: FileUploadVolumeCatalog
    knowledgeId?: string
    projectId?: string
    rootId?: string
    userId?: string
    xpertId?: string
    isolateByUser?: boolean
}

function getXpertUserIsolation(isolateByUser?: boolean) {
    return isolateByUser !== false
}

export function getVolumeSubpath(scope: TVolumeScope) {
    switch (scope.catalog) {
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

export function getVolumeBaseUrl(scope: TVolumeScope) {
    return sandboxVolumeUrl(getVolumeSubpath(scope))
}

export function getVolumeRootPath(tenantId: string, scope: TVolumeScope) {
    const root = getApiContainerSandboxVolumeRootPath(tenantId)
    if (usesFlattenedSandboxVolumeLayout()) {
        return root
    }
    return path.join(root, getVolumeSubpath(scope))
}

export class VolumeClient {
    tenantId: string
    userId: string
    projectId?: string

    protected volumePath: string
    protected baseUrl: string

    static getApiContainerSandboxVolumeRoot(tenantId: string) {
        return getApiContainerSandboxVolumeRootPath(tenantId)
    }

    /**
     * @deprecated Prefer `getApiContainerSandboxVolumeRoot()` to make the path layer explicit.
     */
    static getSandboxVolumeRoot(tenantId: string) {
        return VolumeClient.getApiContainerSandboxVolumeRoot(tenantId)
    }

    // static getSandboxVolumePath(tenantId: string, userId: string, projectId: string): string {
    // 	const root = VolumeClient.getApiContainerSandboxVolumeRoot(tenantId)
    // 	if (environment.envName === 'dev') {
    // 		return root
    // 	}
    // 	return path.join(root, sandboxVolume(projectId, userId))
    // }

    static getWorkspaceRoot(tenantId: string, projectId: string | undefined, userId: string) {
        return getVolumeRootPath(tenantId, {
            catalog: projectId ? 'projects' : 'users',
            projectId,
            userId
        })
    }

    static _getWorkspaceRoot(tenantId: string, type: 'projects' | 'users' | 'knowledges' | string, id: string) {
        const root = VolumeClient.getApiContainerSandboxVolumeRoot(tenantId)
        if (usesFlattenedSandboxVolumeLayout()) {
            return root
        }
        return path.join(root, `/${type}/${id}`)
    }

    /**
     * @deprecated Prefer `getSharedWorkspacePath`
     */
    static async getWorkspacePath(
        tenantId: string,
        projectId: string | undefined,
        userId: string,
        conversationId?: string
    ): Promise<string> {
        const dist = path.join(
            VolumeClient.getWorkspaceRoot(tenantId, projectId, userId),
            getWorkspace(projectId, conversationId) || ''
        )
        await fsPromises.mkdir(dist, { recursive: true })
        return dist
    }

    static async getSharedWorkspacePath(
        tenantId: string,
        projectId: string | undefined,
        userId: string
    ): Promise<string> {
        const dist = getVolumeRootPath(tenantId, {
            catalog: projectId ? 'projects' : 'users',
            projectId,
            userId
        })
        await fsPromises.mkdir(dist, { recursive: true })
        return dist
    }

    static getWorkspaceUrl(projectId: string | undefined, userId: string, conversationId?: string) {
        return sandboxVolumeUrl(sandboxVolume(projectId, userId), getWorkspace(projectId, conversationId) + '/')
    }

    static getSharedWorkspaceUrl(projectId: string | undefined, userId: string) {
        return getVolumeBaseUrl({
            catalog: projectId ? 'projects' : 'users',
            projectId,
            userId
        })
    }

    static async getXpertWorkspacePath(
        tenantId: string,
        xpertId: string,
        userId: string,
        isolateByUser = true
    ): Promise<string> {
        const dist = getVolumeRootPath(tenantId, {
            catalog: 'xperts',
            xpertId,
            userId,
            isolateByUser
        })
        await fsPromises.mkdir(dist, { recursive: true })
        return dist
    }

    static getXpertWorkspaceUrl(xpertId: string, userId: string, isolateByUser = true) {
        return getVolumeBaseUrl({
            catalog: 'xperts',
            xpertId,
            userId,
            isolateByUser
        })
    }

    constructor(params: {
        tenantId: string
        catalog: FileUploadVolumeCatalog
        userId: string
        knowledgeId?: string
        projectId?: string
        rootId?: string
        xpertId?: string
        isolateByUser?: boolean
    }) {
        this.tenantId = params.tenantId
        this.userId = params.userId
        this.projectId = params.projectId

        const scope = {
            catalog: params.catalog,
            knowledgeId: params.knowledgeId,
            projectId: params.projectId,
            rootId: params.rootId,
            userId: params.userId,
            xpertId: params.xpertId,
            isolateByUser: params.isolateByUser
        } satisfies TVolumeScope

        this.baseUrl = getVolumeBaseUrl(scope)
        this.volumePath = getVolumeRootPath(params.tenantId, scope)
    }

    async putFile(
        folder = '',
        file: { originalname: string; buffer: Buffer; mimetype?: string } /*Express.Multer.File*/
    ): Promise<string> {
        const targetFolder = path.join(this.volumePath, folder)
        const filePath = path.join(targetFolder, file.originalname)
        await fsPromises.mkdir(targetFolder, { recursive: true })
        await fsPromises.writeFile(filePath, file.buffer as unknown as string)
        return urlJoin(this.baseUrl, path.join(folder, file.originalname))
    }

    async readFile(filePath: string) {
        const fullPath = path.join(this.volumePath, filePath)
        return await fsPromises.readFile(fullPath, 'utf-8')
    }

    async deleteFile(filePath: string): Promise<void> {
        const fullPath = path.join(this.volumePath, filePath)
        try {
            const stat = await fsPromises.stat(fullPath)
            if (stat.isDirectory()) {
                await fsPromises.rm(fullPath, { recursive: true, force: true })
            } else {
                await fsPromises.unlink(fullPath)
            }
        } catch (error: any) {
            if (error.code !== 'ENOENT') {
                throw error // Re-throw if it's not a "file not found" error
            }
        }
    }

    async list(params: { path?: string; deepth?: number }) {
        const { path: folder, deepth } = params
        return await listFiles(folder || '/', deepth ?? 1, 0, { root: this.volumePath, baseUrl: this.baseUrl })
    }

    getVolumePath(path?: string) {
        return path ? join(this.volumePath, path) : this.volumePath
    }

    getPublicUrl(filePath: string) {
        return filePath ? urlJoin(this.baseUrl, filePath) : this.baseUrl
    }
}
