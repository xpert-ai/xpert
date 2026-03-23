import { FileUploadVolumeCatalog, IUploadFileVolumeTarget } from '@metad/contracts'
import { environment } from '@metad/server-config'
import path from 'path'
import { getSandboxVolumeRootPath, usesFlattenedSandboxVolumeLayout } from '../volume/volume-layout'

export function normalizeFileName(fileName: string) {
    const normalized = path.basename(fileName).trim()
    if (!normalized) {
        throw new Error('Invalid file name')
    }
    return normalized
}

export function normalizeRelativePath(...segments: Array<string | undefined>) {
    const relative = path.posix
        .join(...segments.filter(Boolean).map((segment) => `${segment}`.replace(/\\/g, '/')))
        .replace(/^\/+/, '')
    const normalized = path.posix.normalize(relative)
    if (normalized.startsWith('..')) {
        throw new Error('Invalid relative path')
    }
    return normalized === '.' ? '' : normalized
}

export function getSandboxVolumeRoot(tenantId: string) {
    return getSandboxVolumeRootPath(tenantId)
}

export function getVolumeSubpath(
    catalog: FileUploadVolumeCatalog,
    params: {
        projectId?: string
        knowledgeId?: string
        userId?: string
        rootId?: string
    }
) {
    switch (catalog) {
        case 'knowledges':
            if (!params.knowledgeId) {
                throw new Error('knowledgeId is required for knowledge volume upload')
            }
            return `/knowledges/${params.knowledgeId}`
        case 'projects':
            if (!params.projectId) {
                throw new Error('projectId is required for project volume upload')
            }
            return `/project/${params.projectId}`
        case 'users':
            if (!params.userId) {
                throw new Error('userId is required for user volume upload')
            }
            return `/user/${params.userId}`
        case 'skills':
            if (!params.rootId) {
                throw new Error('rootId is required for skills volume upload')
            }
            return `/skills/${params.rootId}`
    }
}

export function resolveVolumeTarget(target: IUploadFileVolumeTarget, request: { tenantId?: string; userId?: string }) {
    const tenantId = target.tenantId || request.tenantId
    const userId = target.userId || request.userId
    const root = getSandboxVolumeRoot(tenantId)
    const subpath = getVolumeSubpath(target.catalog, {
        projectId: target.projectId,
        knowledgeId: target.knowledgeId,
        userId,
        rootId: target.metadata?.rootId
    })

    return {
        rootPath: usesFlattenedSandboxVolumeLayout() ? root : path.join(root, subpath),
        baseUrl: `${environment.baseUrl}/api/sandbox/volume${subpath}`
    }
}

export function isUtf8Text(fileName: string, mimeType?: string) {
    if (mimeType?.startsWith('text/')) {
        return true
    }

    return ['.json', '.md', '.txt', '.ts', '.tsx', '.js', '.jsx', '.py', '.html', '.css', '.yml', '.yaml'].includes(
        path.extname(fileName).toLowerCase()
    )
}
