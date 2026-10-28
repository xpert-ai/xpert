import { BadRequestException } from '@nestjs/common'
import {
    ArtifactKind,
    ArtifactLinkAccessInput,
    ArtifactLinkStatus,
    ArtifactLinkVersionMode,
    ArtifactSafeHtmlProfile,
    ArtifactShareInput,
    CreateArtifactInput,
    WORKSPACE_FILES_SOURCE,
    WorkspacePortableFileReference
} from '@xpert-ai/plugin-sdk'
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto'
import path from 'node:path'
import { isSupportedArtifactMimeType, PPTX_MIME_TYPE } from './artifact-mime-policy'
import type {
    ArtifactAccessPrincipal,
    ArtifactHeaders,
    ArtifactHttpRequest,
    ArtifactsRuntimeScope,
    NormalizedArtifactSource
} from './artifact-service.types'
import { Artifact, ArtifactLink, ArtifactVersion } from './entities'
export const SIGNED_PREVIEW_QUERY_PARAM = 'xpert_artifact_preview'
export const DEFAULT_SIGNED_PREVIEW_TTL_SECONDS = 15 * 60
export const ARTIFACT_SHARE_SESSION_COOKIE = 'xpert_artifact_share_session'
export const ARTIFACT_SHARE_SESSION_TTL_SECONDS = 15 * 60
export const MAX_TTL_SECONDS = 60 * 60 * 24 * 365
export const DEFAULT_PAGE = 1
export const DEFAULT_PAGE_SIZE = 20
export const MAX_PAGE_SIZE = 100
export const ARTIFACT_LINK_SLUG_LENGTH = 12
export const ARTIFACT_LINK_SLUG_ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz'

export function linkMatchesShare(
    link: ArtifactLink,
    input: ArtifactShareInput,
    versionMode: ArtifactLinkVersionMode,
    version: ArtifactVersion
) {
    if (input.access.mode === 'signed_preview') return false
    const presentation = input.presentation
    const expiresAt = resolveExpiresAt(input.access)
    const linkPrincipals = normalizeStringArray(link.customPrincipals) ?? []
    const inputPrincipals = normalizeStringArray(input.access.customPrincipals) ?? []
    return (
        link.status === 'active' &&
        link.accessMode === input.access.mode &&
        link.versionMode === versionMode &&
        (versionMode === 'latest' || link.artifactVersionId === version.id) &&
        linkPrincipals.length === inputPrincipals.length &&
        [...linkPrincipals].sort().every((principal, index) => principal === [...inputPrincipals].sort()[index]) &&
        (link.expiresAt?.getTime() ?? null) === (expiresAt?.getTime() ?? null) &&
        link.disposition === (presentation?.disposition ?? 'inline') &&
        link.allowDownload === (presentation?.allowDownload ?? true) &&
        (link.safeHtmlProfile ?? null) ===
            (presentation?.safeHtmlProfile ?? defaultSafeHtmlProfile(version.mimeType) ?? null)
    )
}

export function normalizeSourceInput(input?: CreateArtifactInput['source']): NormalizedArtifactSource {
    if (!input) {
        throw new BadRequestException('source is required')
    }
    return {
        pluginName: normalizeRequiredString(input.pluginName, 'source.pluginName'),
        resourceType: normalizeRequiredString(input.resourceType, 'source.resourceType'),
        resourceId: normalizeRequiredString(input.resourceId, 'source.resourceId'),
        checksum: normalizeOptionalString(input.checksum)
    }
}

export function normalizeAccessInput(input?: ArtifactLinkAccessInput | null): ArtifactLinkAccessInput {
    if (!input?.mode) {
        throw new BadRequestException('access.mode is required')
    }
    return {
        ...input,
        mode: input.mode
    }
}

export function normalizeVersionMode(
    mode?: ArtifactLinkVersionMode | null,
    artifactVersionId?: string | null
): ArtifactLinkVersionMode {
    if (mode === 'latest' || mode === 'version') {
        return mode
    }
    return artifactVersionId ? 'version' : 'latest'
}

export function normalizeWorkspaceFileReference(ref: WorkspacePortableFileReference): WorkspacePortableFileReference {
    if (ref.source !== WORKSPACE_FILES_SOURCE) {
        throw new BadRequestException('workspaceFileRef must be a platform workspace file reference')
    }
    return {
        ...ref,
        filePath: normalizeWorkspaceFilePath(ref.filePath),
        workspacePath: normalizeWorkspaceFilePath(ref.workspacePath ?? ref.filePath)
    }
}

export function normalizeWorkspaceFilePath(value?: string | null) {
    const raw = normalizeRequiredString(value, 'workspace file path')
    if (raw.includes('\0')) {
        throw new BadRequestException('workspace file path contains an invalid character')
    }
    const normalized = path.posix.normalize(raw.replace(/\\/g, '/').replace(/^\/+/, ''))
    if (!normalized || normalized === '.' || normalized === '..' || normalized.startsWith('../')) {
        throw new BadRequestException('workspace file path is invalid')
    }
    return normalized
}

export function normalizeMimeType(value?: string | null) {
    const mimeType = normalizeRequiredString(value, 'mimeType').toLowerCase()
    if (mimeType === 'image/svg+xml') {
        throw new BadRequestException('SVG artifacts cannot be shared directly')
    }
    if (isSupportedArtifactMimeType(mimeType)) {
        return mimeType
    }
    throw new BadRequestException(`Unsupported artifact MIME type: ${mimeType}`)
}

export function inferArtifactKind(mimeType: string): ArtifactKind {
    if (mimeType === 'text/html') return 'html'
    if (mimeType === 'text/markdown') return 'markdown'
    if (mimeType === 'application/pdf') return 'pdf'
    if (mimeType === PPTX_MIME_TYPE) return 'pptx'
    if (mimeType.startsWith('image/')) return 'image'
    return 'file'
}

export function defaultSafeHtmlProfile(mimeType: string): ArtifactSafeHtmlProfile | null {
    return mimeType === 'text/html' ? 'strict' : null
}

export function resolveExpiresAt(access: ArtifactLinkAccessInput) {
    if (access.expiresAt) {
        const expiresAt = access.expiresAt instanceof Date ? access.expiresAt : new Date(access.expiresAt)
        if (!Number.isFinite(expiresAt.getTime())) {
            throw new BadRequestException('access.expiresAt is invalid')
        }
        return expiresAt
    }
    if (access.ttlSeconds !== undefined && access.ttlSeconds !== null) {
        const ttlSeconds = normalizePositiveInteger(access.ttlSeconds, DEFAULT_SIGNED_PREVIEW_TTL_SECONDS)
        if (ttlSeconds > MAX_TTL_SECONDS) {
            throw new BadRequestException('access.ttlSeconds is too large')
        }
        return new Date(Date.now() + ttlSeconds * 1000)
    }
    if (access.mode === 'signed_preview') {
        return new Date(Date.now() + DEFAULT_SIGNED_PREVIEW_TTL_SECONDS * 1000)
    }
    return null
}

export function normalizeLinkStatus(link: ArtifactLink): ArtifactLinkStatus {
    if (link.status === 'active' && isExpired(link)) {
        return 'expired'
    }
    return link.status
}

export function isExpired(link: Pick<ArtifactLink, 'expiresAt'>) {
    return Boolean(link.expiresAt && link.expiresAt.getTime() <= Date.now())
}

export function sameTenantAndOrganization(
    link: Pick<ArtifactLink, 'tenantId' | 'organizationId'>,
    principal?: ArtifactAccessPrincipal | null
) {
    return Boolean(
        principal?.tenantId &&
        principal.tenantId === link.tenantId &&
        principal.organizationId &&
        principal.organizationId === link.organizationId
    )
}

export function sameTenant(link: Pick<ArtifactLink, 'tenantId'>, principal?: ArtifactAccessPrincipal | null) {
    return Boolean(principal?.tenantId && principal.tenantId === link.tenantId)
}

export function matchesCustomPrincipal(
    link: Pick<ArtifactLink, 'customPrincipals'>,
    principal?: ArtifactAccessPrincipal | null
) {
    const customPrincipals = normalizeStringArray(link.customPrincipals) ?? []
    const candidates = [
        principal?.userId,
        principal?.userId ? `user:${principal.userId}` : null,
        principal?.organizationId ? `organization:${principal.organizationId}` : null
    ].filter((item): item is string => Boolean(item))
    return candidates.some((candidate) => customPrincipals.includes(candidate))
}

export function artifactToScope(
    artifact: Artifact
): Required<Pick<ArtifactsRuntimeScope, 'tenantId'>> & ArtifactsRuntimeScope {
    return {
        tenantId: normalizeRequiredString(artifact.tenantId, 'artifact.tenantId'),
        organizationId: artifact.organizationId,
        userId: artifact.userId,
        workspaceId: artifact.workspaceId,
        projectId: artifact.projectId,
        xpertId: artifact.xpertId
    }
}

export function createSignedPreviewToken() {
    return randomBytes(24).toString('base64url')
}

export function createArtifactLinkSlug() {
    const bytes = randomBytes(ARTIFACT_LINK_SLUG_LENGTH)
    let slug = ''
    for (const byte of bytes) {
        slug += ARTIFACT_LINK_SLUG_ALPHABET[byte % ARTIFACT_LINK_SLUG_ALPHABET.length]
    }
    return slug
}

export function digestBuffer(buffer: Buffer) {
    return createHash('sha256').update(buffer).digest('hex')
}

export function digestString(value: string) {
    return createHash('sha256').update(value).digest('hex')
}

export function hashString(value?: string | null) {
    return value ? digestString(value) : undefined
}

export function safeEqualString(left: string, right: string) {
    const leftBuffer = Buffer.from(left)
    const rightBuffer = Buffer.from(right)
    return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer)
}

export function isUniqueConstraintError(error: unknown) {
    if (!(error instanceof Error)) return false
    const code = Reflect.get(error, 'code')
    return (
        code === '23505' ||
        code === 1062 ||
        code === 'SQLITE_CONSTRAINT' ||
        /duplicate key|unique constraint|duplicate entry/i.test(error.message)
    )
}

export function normalizeRequiredString(value: unknown, field: string) {
    const normalized = normalizeOptionalString(value)
    if (!normalized) {
        throw new BadRequestException(`${field} is required`)
    }
    return normalized
}

export function normalizeOptionalString(value: unknown) {
    return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

export function normalizeStringArray(value?: string[] | null) {
    const result = Array.isArray(value)
        ? value.map((item) => normalizeOptionalString(item)).filter((item): item is string => Boolean(item))
        : []
    return result.length ? Array.from(new Set(result)) : null
}

export function normalizePositiveInteger(value: unknown, fallback: number) {
    const numberValue = typeof value === 'number' ? value : Number(value)
    if (!Number.isFinite(numberValue) || numberValue <= 0) {
        return fallback
    }
    return Math.trunc(numberValue)
}

export function getHeaderValue(headers: ArtifactHeaders, key: string) {
    const value = headers[key] ?? headers[key.toLowerCase()]
    return Array.isArray(value) ? value[0] : value
}

export function extractBearerToken(headers: ArtifactHeaders) {
    const authorization = getHeaderValue(headers, 'authorization')
    const match = authorization?.match(/^Bearer\s+(.+)$/i)
    return match?.[1]
}

export function readCookie(headers: ArtifactHeaders, name: string) {
    const cookieHeader = getHeaderValue(headers, 'cookie')
    if (!cookieHeader) return undefined
    for (const pair of cookieHeader.split(';')) {
        const separator = pair.indexOf('=')
        if (separator < 0 || pair.slice(0, separator).trim() !== name) continue
        const value = pair.slice(separator + 1).trim()
        try {
            return decodeURIComponent(value)
        } catch {
            return undefined
        }
    }
    return undefined
}

export function getRequestIp(request: ArtifactHttpRequest) {
    return request.ips?.[0] ?? request.ip ?? request.socket?.remoteAddress
}
