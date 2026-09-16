// Invariants: file references may narrow paths, but never replace the host-bound owner or catalog.
import type { WorkspaceFileScope } from '@xpert-ai/plugin-sdk'
import { BadRequestException } from '@nestjs/common'
import { t } from 'i18next'
import type { WorkspaceFilesRuntimeDefaults } from './workspace-files-runtime-capability.service'

function normalizeOptionalString(value: unknown) {
    return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

export function applyRuntimeScopeDefaults<T extends WorkspaceFileScope>(
    input: T,
    defaults: WorkspaceFilesRuntimeDefaults
): T {
    const scoped = { ...input } as T & WorkspaceFileScope & { conversationId?: string | null }
    assertRuntimeScopeMatch('tenantId', scoped.tenantId, defaults.tenantId)
    assertRuntimeScopeMatch('organizationId', scoped.organizationId, defaults.organizationId)
    assertRuntimeScopeMatch('userId', scoped.userId, defaults.userId)
    scoped.tenantId = normalizeOptionalString(scoped.tenantId) ?? normalizeOptionalString(defaults.tenantId)
    // Organization is part of the same trusted runtime boundary as tenant and
    // must survive portable-reference replay and delayed jobs.
    scoped.organizationId =
        normalizeOptionalString(scoped.organizationId) ?? normalizeOptionalString(defaults.organizationId)
    scoped.userId = normalizeOptionalString(scoped.userId) ?? normalizeOptionalString(defaults.userId)
    assertRuntimeScopeMatch('conversationId', scoped.conversationId, defaults.conversationId)
    scoped.conversationId =
        normalizeOptionalString(scoped.conversationId) ?? normalizeOptionalString(defaults.conversationId)

    const defaultCatalog = normalizeOptionalString(defaults.catalog) as WorkspaceFileScope['catalog']
    const defaultScopeId = normalizeOptionalString(defaults.scopeId)
    if (defaultCatalog) {
        const requestedCatalog = normalizeOptionalString(scoped.catalog)
        if (requestedCatalog && requestedCatalog !== defaultCatalog) {
            throw new BadRequestException(
                t('server-ai:Error.WorkspaceFileCatalogOutsideExecutionScope', {
                    defaultValue: 'Workspace file catalog is outside the current execution scope'
                })
            )
        }
        scoped.catalog = defaultCatalog
    }
    if (defaultScopeId) {
        const requestedScopeId = normalizeOptionalString(scoped.scopeId)
        if (requestedScopeId && requestedScopeId !== defaultScopeId) {
            throw new BadRequestException(
                t('server-ai:Error.WorkspaceFileScopeOutsideExecutionScope', {
                    defaultValue: 'Workspace file scopeId is outside the current execution scope'
                })
            )
        }
        scoped.scopeId = defaultScopeId
        if (defaultCatalog === 'projects') {
            assertRuntimeScopeMatch('projectId', scoped.projectId, defaults.projectId ?? defaultScopeId)
        } else if (defaultCatalog === 'xperts' || defaultCatalog === 'user-xperts') {
            assertRuntimeScopeMatch('xpertId', scoped.xpertId, defaults.xpertId ?? defaultScopeId)
        }
    }

    const boundScope = resolveBoundRuntimeWorkspaceScope(defaults)
    if (boundScope) {
        assertBoundRuntimeWorkspaceScope(scoped, boundScope)
        scoped.catalog = boundScope.catalog
        scoped.scopeId = boundScope.scopeId
        scoped.projectId = boundScope.projectId
        scoped.xpertId = boundScope.xpertId
        scoped.knowledgeId = undefined
        scoped.rootId = undefined
        scoped.isolateByUser = boundScope.isolateByUser
        return scoped
    }

    if (!hasExplicitWorkspaceScope(scoped)) {
        const projectId = normalizeOptionalString(defaults.projectId)
        const xpertId = normalizeOptionalString(defaults.xpertId)
        if (defaultCatalog && defaultScopeId) {
            scoped.catalog = defaultCatalog
            scoped.scopeId = defaultScopeId
            if (defaultCatalog === 'projects') {
                scoped.projectId = projectId ?? defaultScopeId
            } else if (defaultCatalog === 'xperts' || defaultCatalog === 'user-xperts') {
                scoped.xpertId = xpertId ?? defaultScopeId
                if (defaultCatalog === 'xperts') {
                    scoped.isolateByUser = defaults.isolateByUser ?? false
                }
            }
        } else if (projectId) {
            scoped.projectId = projectId
        } else if (xpertId) {
            scoped.xpertId = xpertId
            scoped.isolateByUser = scoped.isolateByUser ?? false
        }
    } else if (!normalizeOptionalString(scoped.scopeId)) {
        const catalog = normalizeOptionalString(scoped.catalog)
        if (catalog === 'projects' && !normalizeOptionalString(scoped.projectId)) {
            scoped.projectId = normalizeOptionalString(defaults.projectId)
        } else if ((catalog === 'xperts' || catalog === 'user-xperts') && !normalizeOptionalString(scoped.xpertId)) {
            scoped.xpertId = normalizeOptionalString(defaults.xpertId)
            if (catalog === 'xperts') {
                scoped.isolateByUser = scoped.isolateByUser ?? false
            }
        }
    }

    return scoped
}

type BoundRuntimeWorkspaceScope = Pick<
    WorkspaceFileScope,
    'catalog' | 'scopeId' | 'projectId' | 'xpertId' | 'isolateByUser'
> & {
    catalog: 'projects' | 'xperts' | 'user-xperts' | 'users'
    scopeId: string
}

function resolveBoundRuntimeWorkspaceScope(defaults: WorkspaceFilesRuntimeDefaults): BoundRuntimeWorkspaceScope | null {
    const projectId = normalizeOptionalString(defaults.projectId)
    const xpertId = normalizeOptionalString(defaults.xpertId)
    const requestedCatalog = normalizeOptionalString(defaults.catalog)
    const requestedScopeId = normalizeOptionalString(defaults.scopeId)

    if (requestedCatalog === 'users') {
        const userId = normalizeOptionalString(defaults.userId)
        if (!userId || requestedScopeId !== userId || projectId || xpertId) {
            throw new BadRequestException(
                t('server-ai:Error.McpPersonalFilesIdentityRequired', {
                    defaultValue: 'Personal MCP files require an authenticated user and no Project or Xpert binding.'
                })
            )
        }
        return { catalog: 'users', scopeId: userId, projectId: undefined, xpertId: undefined, isolateByUser: false }
    }

    if (projectId) {
        if (
            (requestedCatalog && requestedCatalog !== 'projects') ||
            (requestedScopeId && requestedScopeId !== projectId)
        ) {
            throw new BadRequestException('Workspace runtime Project scope is inconsistent')
        }
        return {
            catalog: 'projects',
            scopeId: projectId,
            projectId,
            xpertId,
            isolateByUser: false
        }
    }

    if (!xpertId) {
        return null
    }
    const catalog = requestedCatalog ?? (defaults.isolateByUser ? 'user-xperts' : 'xperts')
    if ((catalog !== 'xperts' && catalog !== 'user-xperts') || (requestedScopeId && requestedScopeId !== xpertId)) {
        throw new BadRequestException('Workspace runtime Xpert scope is inconsistent')
    }
    return {
        catalog,
        scopeId: xpertId,
        projectId: undefined,
        xpertId,
        isolateByUser: catalog === 'user-xperts'
    }
}

function assertBoundRuntimeWorkspaceScope(scope: WorkspaceFileScope, bound: BoundRuntimeWorkspaceScope) {
    const requestedCatalog = normalizeOptionalString(scope.catalog)
    const requestedScopeId = normalizeOptionalString(scope.scopeId)
    const requestedProjectId = normalizeOptionalString(scope.projectId)
    const requestedXpertId = normalizeOptionalString(scope.xpertId)
    const hasForeignScope = Boolean(
        normalizeOptionalString(scope.knowledgeId) ||
        normalizeOptionalString(scope.rootId) ||
        (bound.catalog === 'projects' ? false : requestedProjectId)
    )
    if (
        (requestedCatalog && requestedCatalog !== bound.catalog) ||
        (requestedScopeId && requestedScopeId !== bound.scopeId) ||
        (requestedProjectId && requestedProjectId !== bound.projectId) ||
        (requestedXpertId && requestedXpertId !== bound.xpertId) ||
        (typeof scope.isolateByUser === 'boolean' && scope.isolateByUser !== bound.isolateByUser) ||
        hasForeignScope
    ) {
        throw new BadRequestException('Workspace file scope is outside the current execution scope')
    }
}

function assertRuntimeScopeMatch(
    field: 'tenantId' | 'organizationId' | 'userId' | 'projectId' | 'xpertId' | 'conversationId',
    requested: string | null | undefined,
    authoritative: string | null | undefined
) {
    const requestedValue = normalizeOptionalString(requested)
    const authoritativeValue = normalizeOptionalString(authoritative)
    if (requestedValue && authoritativeValue && requestedValue !== authoritativeValue) {
        throw new BadRequestException(
            t('server-ai:Error.WorkspaceFileFieldOutsideExecutionScope', {
                field,
                defaultValue: 'Workspace file {{field}} is outside the current execution scope'
            })
        )
    }
}

function hasExplicitWorkspaceScope(scope: WorkspaceFileScope) {
    return Boolean(
        normalizeOptionalString(scope.catalog) ||
        normalizeOptionalString(scope.scopeId) ||
        normalizeOptionalString(scope.projectId) ||
        normalizeOptionalString(scope.knowledgeId) ||
        normalizeOptionalString(scope.rootId) ||
        normalizeOptionalString(scope.xpertId)
    )
}

export function normalizeRequiredWorkspaceFilePath(value: unknown) {
    const normalized = normalizeOptionalString(value)?.replace(/\\/g, '/').replace(/^\/+/, '').replace(/^\.\//, '')
    if (!normalized || normalized === '.' || normalized.split('/').includes('..')) {
        throw new BadRequestException(
            t('server-ai:Error.WorkspaceFilePathRequired', { defaultValue: 'workspace file path is required' })
        )
    }
    return normalized
}
