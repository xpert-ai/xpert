import { BadRequestException } from '@nestjs/common'
import { t } from 'i18next'
import path from 'node:path'
import type {
    WorkspaceRuntimeFileDescriptor,
    WorkspaceFileLocator,
    WorkspaceFileScope,
    WorkspaceRuntimeWriteInput
} from '@xpert-ai/plugin-sdk'
import { resolveWorkspaceFileCatalog } from '../../file-understanding/domain/workspace-file'
import type { WorkspaceFilesRuntimeDefaults } from './workspace-files-runtime-capability.service'

export function normalizeOptionalString(value: unknown) {
    return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

type RuntimeFileDescriptor = WorkspaceRuntimeFileDescriptor & WorkspaceFileScope & { source?: string }

export function toWorkspaceRuntimeDescriptor(
    input: WorkspaceFileLocator | WorkspaceRuntimeWriteInput
): RuntimeFileDescriptor {
    return typeof input === 'string' ? { path: input } : (input ?? {})
}

export function readRuntimeFilePath(descriptor: RuntimeFileDescriptor, required = true) {
    const raw =
        normalizeOptionalString(descriptor.filePath) ??
        normalizeOptionalString(descriptor.workspacePath) ??
        normalizeOptionalString(descriptor.path)
    if (!raw && required) {
        throw new BadRequestException('workspace file path is required')
    }
    return raw
}

export function readRuntimeScope(descriptor: RuntimeFileDescriptor): WorkspaceFileScope {
    return {
        tenantId: normalizeOptionalString(descriptor.tenantId),
        organizationId: normalizeOptionalString(descriptor.organizationId),
        userId: normalizeOptionalString(descriptor.userId),
        catalog: normalizeOptionalString(descriptor.catalog) as WorkspaceFileScope['catalog'],
        scopeId: normalizeOptionalString(descriptor.scopeId),
        projectId: normalizeOptionalString(descriptor.projectId),
        knowledgeId: normalizeOptionalString(descriptor.knowledgeId),
        rootId: normalizeOptionalString(descriptor.rootId),
        xpertId: normalizeOptionalString(descriptor.xpertId),
        isolateByUser: typeof descriptor.isolateByUser === 'boolean' ? descriptor.isolateByUser : undefined
    }
}

/**
 * Fill missing scope fields from the current runtime and infer the default
 * workspace catalog. Project scope wins over Xpert scope because project
 * workspaces are the broader collaboration boundary.
 */
/** Normalize a path already persisted relative to its resolved Volume root. */
export function normalizeVolumeRelativeFilePath(value: unknown) {
    const raw = normalizeOptionalString(value)
    if (!raw || raw.includes('\0')) {
        throw new BadRequestException(
            t('server-ai:Error.WorkspaceFilePathRequired', { defaultValue: 'workspace file path is required' })
        )
    }

    const unixPath = raw.replace(/\\/g, '/')
    if (path.posix.isAbsolute(unixPath)) {
        throw new BadRequestException(
            t('server-ai:Error.WorkspaceFilePersistedPathRelative', {
                defaultValue: 'persisted workspace file path must be relative to its volume root'
            })
        )
    }
    const parts = unixPath.split('/').filter((part) => part && part !== '.')
    if (!parts.length || parts.some((part) => part === '..')) {
        throw new BadRequestException(
            t('server-ai:Error.WorkspaceFilePathInvalid', { defaultValue: 'invalid workspace file path' })
        )
    }

    const normalized = path.posix.normalize(parts.join('/'))
    if (!normalized || normalized === '.' || normalized.startsWith('../') || path.posix.isAbsolute(normalized)) {
        throw new BadRequestException(
            t('server-ai:Error.WorkspaceFilePathInvalid', { defaultValue: 'invalid workspace file path' })
        )
    }
    return normalized
}

/**
 * Convert sandbox-visible or workspace-relative paths into safe Volume-relative
 * paths. Absolute paths are accepted only when they are inside the runtime
 * workspace root, including Docker's canonical `/workspace` mount.
 */
export function normalizeRuntimeWorkspaceFilePath(value: unknown, defaults: WorkspaceFilesRuntimeDefaults) {
    const raw = normalizeOptionalString(value)
    if (!raw) {
        throw new BadRequestException(
            t('server-ai:Error.WorkspaceFilePathRequired', { defaultValue: 'workspace file path is required' })
        )
    }
    if (raw.includes('\0')) {
        throw new BadRequestException(
            t('server-ai:Error.WorkspaceFilePathInvalidCharacters', {
                defaultValue: 'workspace file path contains invalid characters'
            })
        )
    }

    const unixPath = raw.replace(/\\/g, '/')
    let relativePath = unixPath
    if (path.posix.isAbsolute(unixPath)) {
        const roots = uniqueWorkspaceRoots(defaults)
        const normalizedCandidate = path.posix.normalize(unixPath)
        const matchedRoot = roots.find((root) => {
            const normalizedRoot = path.posix.normalize(root)
            return normalizedCandidate === normalizedRoot || normalizedCandidate.startsWith(`${normalizedRoot}/`)
        })
        if (!matchedRoot) {
            throw new BadRequestException(
                t('server-ai:Error.WorkspaceFileAbsolutePathOutsideRoot', {
                    defaultValue: 'absolute workspace file path must be inside the runtime workspace root'
                })
            )
        }
        const normalizedRoot = path.posix.normalize(matchedRoot)
        if (normalizedCandidate === normalizedRoot) {
            throw new BadRequestException(
                t('server-ai:Error.WorkspaceFilePathBelowRootRequired', {
                    defaultValue: 'workspace file path must point to a file below the workspace root'
                })
            )
        }
        relativePath = unixPath.slice(matchedRoot.length).replace(/^\/+/, '')
    } else {
        const workingDirectory = runtimeWorkingDirectoryRelativePath(defaults)
        if (workingDirectory) {
            relativePath = path.posix.join(workingDirectory, unixPath)
        }
    }

    const parts = relativePath.split('/').filter((part) => part && part !== '.')
    if (!parts.length || parts.some((part) => part === '..')) {
        throw new BadRequestException(
            t('server-ai:Error.WorkspaceFilePathInvalid', { defaultValue: 'invalid workspace file path' })
        )
    }

    const normalized = path.posix.normalize(parts.join('/'))
    if (
        !normalized ||
        normalized === '.' ||
        normalized === '..' ||
        normalized.startsWith('../') ||
        path.posix.isAbsolute(normalized)
    ) {
        throw new BadRequestException(
            t('server-ai:Error.WorkspaceFilePathInvalid', { defaultValue: 'invalid workspace file path' })
        )
    }
    return normalized
}

/** Return the possible sandbox workspace roots for the current runtime scope. */
function uniqueWorkspaceRoots(defaults: WorkspaceFilesRuntimeDefaults) {
    const roots = [
        normalizeOptionalString(defaults.workspaceRoot),
        normalizeOptionalString(defaults.workspacePath),
        '/workspace'
    ].filter(Boolean) as string[]
    return Array.from(
        new Set(roots.map((root) => path.posix.normalize(root.replace(/\\/g, '/')).replace(/\/+$/, '') || '/'))
    )
}

/** Rebuild the sandbox-visible workspace path stored in portable references. */
export function toRuntimeWorkspacePath(filePath: string, defaults: WorkspaceFilesRuntimeDefaults) {
    const workspaceRoot = normalizeOptionalString(defaults.workspaceRoot) ?? '/workspace'
    return path.posix.join(workspaceRoot, filePath)
}

function runtimeWorkingDirectoryRelativePath(defaults: WorkspaceFilesRuntimeDefaults) {
    const workspaceRoot = normalizeOptionalString(defaults.workspaceRoot)
    const workspacePath = normalizeOptionalString(defaults.workspacePath)
    if (!workspaceRoot || !workspacePath) {
        return ''
    }
    const relativePath = path.posix.relative(
        path.posix.normalize(workspaceRoot.replace(/\\/g, '/')),
        path.posix.normalize(workspacePath.replace(/\\/g, '/'))
    )
    if (!relativePath || relativePath === '.') {
        return ''
    }
    if (relativePath.startsWith('../') || path.posix.isAbsolute(relativePath)) {
        throw new BadRequestException(
            t('server-ai:Error.WorkspaceRuntimePathOutsideRoot', {
                defaultValue: 'runtime workspace path must be inside the workspace root'
            })
        )
    }
    return relativePath
}

export function normalizeUploadFolder(value: string) {
    return value && value !== '.' ? value : undefined
}

export function resolveWorkspaceVolumeScopeError(input: WorkspaceFileScope, context: string) {
    const catalog = resolveWorkspaceFileCatalog(input)
    switch (catalog) {
        case 'projects':
            return `projectId is required for project ${context}`
        case 'xperts':
            return `xpertId is required for xpert ${context}`
        case 'user-xperts':
            return `userId and xpertId are required for user-isolated xpert ${context}`
        case 'users':
            return `userId is required for user ${context}`
        case 'knowledges':
            return `knowledgeId is required for knowledge ${context}`
        case 'skills':
            return `rootId is required for skill ${context}`
        default:
            return 'workspace file catalog is required'
    }
}
