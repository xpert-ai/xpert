import { FileUploadVolumeCatalog, IUploadFileVolumeTarget } from '@xpert-ai/contracts'
import path from 'path'
import {
    getVolumeBaseUrl,
    getVolumeRootPath,
    getVolumeSubpath as getSharedVolumeSubpath
} from '../volume/volume'
import { getApiContainerSandboxVolumeRootPath } from '../volume/volume-layout'

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

export function getApiContainerSandboxVolumeRoot(tenantId: string) {
    return getApiContainerSandboxVolumeRootPath(tenantId)
}

export function getVolumeSubpath(
    catalog: FileUploadVolumeCatalog,
    params: {
        projectId?: string
        knowledgeId?: string
        isolateByUser?: boolean
        userId?: string
        xpertId?: string
        rootId?: string
    }
) {
    return getSharedVolumeSubpath({
        catalog,
        knowledgeId: params.knowledgeId,
        projectId: params.projectId,
        rootId: params.rootId,
        userId: params.userId,
        xpertId: params.xpertId,
        isolateByUser: params.isolateByUser
    })
}

export function resolveVolumeTarget(target: IUploadFileVolumeTarget, request: { tenantId?: string; userId?: string }) {
    const tenantId = target.tenantId || request.tenantId
    const userId = target.userId || request.userId

    return {
        rootPath: getVolumeRootPath(tenantId, {
            catalog: target.catalog,
            knowledgeId: target.knowledgeId,
            projectId: target.projectId,
            rootId: target.metadata?.rootId,
            userId,
            xpertId: target.xpertId,
            isolateByUser: target.isolateByUser
        }),
        baseUrl: getVolumeBaseUrl({
            catalog: target.catalog,
            knowledgeId: target.knowledgeId,
            projectId: target.projectId,
            rootId: target.metadata?.rootId,
            userId,
            xpertId: target.xpertId,
            isolateByUser: target.isolateByUser
        })
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
