import type { WorkspaceFileCatalog, WorkspaceFileScope } from '@xpert-ai/plugin-sdk'
import path from 'node:path'
import type { VolumeScope } from '../../shared/volume'
import type { FileAsset } from '../entities'

export type FileAssetWorkspaceScopeDefaults = {
    tenantId?: string | null
    userId?: string | null
}

export type WorkspaceFileVolumeScope = Omit<VolumeScope, 'catalog'> & {
    catalog: WorkspaceFileCatalog
}

export type WorkspaceVolumeScopeResolution = {
    volumeScope: WorkspaceFileVolumeScope
    catalog: WorkspaceFileCatalog
    scopeId?: string
}

export type WorkspaceVolumeScopeOptions = FileAssetWorkspaceScopeDefaults & {
    defaultCatalog?: WorkspaceFileCatalog | null
    inferUserScope?: boolean
}

export function resolveFileAssetWorkspaceRelativePath(
    fileAsset?: Pick<FileAsset, 'metadata' | 'workspacePath'> | null,
    fallbackPath?: string | null
) {
    const workspaceRecord = readWorkspaceMetadataRecord(fileAsset?.metadata)
    return (
        normalizeWorkspaceRelativePath(workspaceRecord?.relativePath) ??
        normalizeWorkspaceRelativePath(workspaceRecord?.workspacePath) ??
        normalizeWorkspaceRelativePath(fileAsset?.workspacePath) ??
        normalizeWorkspaceRelativePath(fallbackPath)
    )
}

export function resolveFileAssetWorkspaceVolumeScope(
    fileAsset?: Pick<FileAsset, 'metadata' | 'tenantId' | 'userId' | 'projectId' | 'xpertId'> | null,
    defaults: FileAssetWorkspaceScopeDefaults = {}
): VolumeScope | null {
    const tenantId = normalizeOptionalString(fileAsset?.tenantId) ?? normalizeOptionalString(defaults.tenantId)
    if (!tenantId) {
        return null
    }

    const workspaceRecord = readWorkspaceMetadataRecord(fileAsset?.metadata)
    if (!workspaceRecord) {
        return inferFileAssetWorkspaceVolumeScope(fileAsset, tenantId, defaults)
    }

    const userId = normalizeOptionalString(fileAsset?.userId) ?? normalizeOptionalString(defaults.userId)
    if (normalizeOptionalString(workspaceRecord.catalog) === 'environment') {
        const environmentId = normalizeOptionalString(workspaceRecord.scopeId)
        return environmentId
            ? {
                  tenantId,
                  catalog: 'environment',
                  environmentId,
                  userId
              }
            : inferFileAssetWorkspaceVolumeScope(fileAsset, tenantId, defaults)
    }
    const resolved = resolveWorkspaceVolumeScope(
        {
            tenantId,
            userId,
            catalog: normalizeOptionalString(workspaceRecord.catalog) as WorkspaceFileCatalog | undefined,
            scopeId: normalizeOptionalString(workspaceRecord.scopeId),
            isolateByUser: typeof workspaceRecord.isolateByUser === 'boolean' ? workspaceRecord.isolateByUser : false
        },
        { tenantId, userId }
    )

    return resolved?.volumeScope ?? inferFileAssetWorkspaceVolumeScope(fileAsset, tenantId, defaults)
}

export function inferFileAssetWorkspaceVolumeScope(
    fileAsset: Pick<FileAsset, 'userId' | 'projectId' | 'xpertId'> | null | undefined,
    tenantId: string,
    defaults: Pick<FileAssetWorkspaceScopeDefaults, 'userId'> = {}
): VolumeScope | null {
    return inferWorkspaceVolumeScope(fileAsset, tenantId, defaults)?.volumeScope ?? null
}

export function resolveWorkspaceVolumeScope(
    input?: WorkspaceFileScope | null,
    options: WorkspaceVolumeScopeOptions = {}
): WorkspaceVolumeScopeResolution | null {
    const tenantId = normalizeOptionalString(input?.tenantId) ?? normalizeOptionalString(options.tenantId)
    if (!tenantId) {
        return null
    }

    const userId = normalizeOptionalString(input?.userId) ?? normalizeOptionalString(options.userId)
    const catalog = resolveWorkspaceFileCatalog(input, { defaultCatalog: options.defaultCatalog })
    if (!catalog) {
        return inferWorkspaceVolumeScope(input, tenantId, {
            userId,
            inferUserScope: options.inferUserScope ?? false
        })
    }

    const scopeId = normalizeOptionalString(input?.scopeId)
    switch (catalog) {
        case 'projects': {
            const projectId = normalizeOptionalString(input?.projectId) ?? scopeId
            return projectId
                ? {
                      volumeScope: { tenantId, catalog, projectId, userId },
                      catalog,
                      scopeId: projectId
                  }
                : null
        }
        case 'xperts': {
            const xpertId = normalizeOptionalString(input?.xpertId) ?? scopeId
            return xpertId
                ? {
                      volumeScope: {
                          tenantId,
                          catalog,
                          xpertId,
                          userId,
                          isolateByUser: input?.isolateByUser ?? false
                      },
                      catalog,
                      scopeId: xpertId
                  }
                : null
        }
        case 'users': {
            const targetUserId = scopeId ?? userId
            return targetUserId
                ? {
                      volumeScope: { tenantId, catalog, userId: targetUserId },
                      catalog,
                      scopeId: targetUserId
                  }
                : null
        }
        case 'knowledges': {
            const knowledgeId = normalizeOptionalString(input?.knowledgeId) ?? scopeId
            return knowledgeId
                ? {
                      volumeScope: { tenantId, catalog, knowledgeId, userId },
                      catalog,
                      scopeId: knowledgeId
                  }
                : null
        }
        case 'skills': {
            const rootId = normalizeOptionalString(input?.rootId) ?? scopeId
            return rootId
                ? {
                      volumeScope: { tenantId, catalog, rootId, userId },
                      catalog,
                      scopeId: rootId
                  }
                : null
        }
    }
}

export function inferWorkspaceVolumeScope(
    input: Pick<WorkspaceFileScope, 'userId' | 'projectId' | 'knowledgeId' | 'rootId' | 'xpertId'> | null | undefined,
    tenantId: string,
    options: Pick<WorkspaceVolumeScopeOptions, 'userId' | 'inferUserScope'> = {}
): WorkspaceVolumeScopeResolution | null {
    const userId = normalizeOptionalString(input?.userId) ?? normalizeOptionalString(options.userId)
    const projectId = normalizeOptionalString(input?.projectId)
    if (projectId) {
        return {
            volumeScope: { tenantId, catalog: 'projects', projectId, userId },
            catalog: 'projects',
            scopeId: projectId
        }
    }

    const knowledgeId = normalizeOptionalString(input?.knowledgeId)
    if (knowledgeId) {
        return {
            volumeScope: { tenantId, catalog: 'knowledges', knowledgeId, userId },
            catalog: 'knowledges',
            scopeId: knowledgeId
        }
    }

    const rootId = normalizeOptionalString(input?.rootId)
    if (rootId) {
        return {
            volumeScope: { tenantId, catalog: 'skills', rootId, userId },
            catalog: 'skills',
            scopeId: rootId
        }
    }

    const xpertId = normalizeOptionalString(input?.xpertId)
    if (xpertId) {
        return {
            volumeScope: { tenantId, catalog: 'xperts', xpertId, userId, isolateByUser: false },
            catalog: 'xperts',
            scopeId: xpertId
        }
    }

    if (options.inferUserScope !== false && userId) {
        return {
            volumeScope: { tenantId, catalog: 'users', userId },
            catalog: 'users',
            scopeId: userId
        }
    }

    return null
}

export function resolveWorkspaceFileCatalog(
    input?: Pick<WorkspaceFileScope, 'catalog' | 'projectId' | 'knowledgeId' | 'rootId' | 'xpertId'> | null,
    options: Pick<WorkspaceVolumeScopeOptions, 'defaultCatalog'> = {}
): WorkspaceFileCatalog | null {
    const catalog = normalizeOptionalString(input?.catalog)
    if (catalog) {
        return isWorkspaceFileCatalog(catalog) ? catalog : null
    }
    if (normalizeOptionalString(input?.projectId)) {
        return 'projects'
    }
    if (normalizeOptionalString(input?.knowledgeId)) {
        return 'knowledges'
    }
    if (normalizeOptionalString(input?.rootId)) {
        return 'skills'
    }
    if (normalizeOptionalString(input?.xpertId)) {
        return 'xperts'
    }
    return options.defaultCatalog ?? null
}

export function isWorkspaceFileCatalog(value: string): value is WorkspaceFileCatalog {
    return ['projects', 'users', 'knowledges', 'skills', 'xperts'].includes(value)
}

function readWorkspaceMetadataRecord(metadata?: Record<string, unknown>) {
    const workspace = metadata?.workspace
    return workspace && typeof workspace === 'object' && !Array.isArray(workspace)
        ? (workspace as Record<string, unknown>)
        : null
}

function normalizeWorkspaceRelativePath(value: unknown) {
    const raw = normalizeOptionalString(value)
    if (!raw) {
        return null
    }
    const normalized = path.posix.normalize(raw.replace(/\\/g, '/').replace(/^\/+/, ''))
    if (!normalized || normalized === '.' || normalized === '..' || normalized.startsWith('../')) {
        return null
    }
    return normalized
}

function normalizeOptionalString(value: unknown) {
    return typeof value === 'string' && value.trim() ? value.trim() : undefined
}
