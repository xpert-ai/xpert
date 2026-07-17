import { CACHE_MANAGER } from '@nestjs/cache-manager'
import {
    BadRequestException,
    ForbiddenException,
    Inject,
    Injectable,
    InternalServerErrorException,
    NotFoundException,
    UnauthorizedException
} from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import type { Cache } from 'cache-manager'
import type { CookieOptions, Request } from 'express'
import { randomUUID } from 'node:crypto'
import { basename } from 'node:path'
import type { JwtPayload } from 'jsonwebtoken'
import { sign, verify } from 'jsonwebtoken'
import { t } from 'i18next'
import type {
    XpertViewFileAccessGrantResult,
    XpertViewFileAccessPurpose,
    XpertViewFileAccessRequest,
    XpertViewFileAccessSessionResult
} from '@xpert-ai/contracts'
import type { WorkspacePortableFileReference } from '@xpert-ai/plugin-sdk'
import { environment } from '@xpert-ai/server-config'
import { RequestContext, ViewExtensionService } from '@xpert-ai/server-core'
import { resolveWorkspaceVolumeScope } from '../file-understanding'
import { VOLUME_CLIENT, VolumeClient, VolumeHandle } from '../shared'

export const WORKSPACE_FILE_ACCESS_COOKIE_NAME = 'xpert_workspace_file_access'
const WORKSPACE_FILE_ACCESS_AUDIENCE = 'workspace-view-file-access'
const WORKSPACE_FILE_ACCESS_SUBJECT = 'workspace-view-file-access-session'
const WORKSPACE_FILE_ACCESS_TTL_MS = 60 * 60 * 1000

type WorkspaceFileAccessBinding = {
    tenantId: string
    organizationId: string | null
    userId: string
    hostType: string
    hostId: string
    viewKey: string
}

type WorkspaceFileAccessSessionRecord = WorkspaceFileAccessBinding & {
    sessionId: string
    origin: string | null
    expiresAt: string
}

type WorkspaceFileAccessGrantRecord = WorkspaceFileAccessBinding & {
    sessionId: string
    grantId: string
    fileKey: string
    targetId?: string
    purpose: XpertViewFileAccessPurpose
    reference: WorkspacePortableFileReference
    fileName: string
    publicFileName: string
    mimeType: string
    size?: number
    expiresAt: string
}

type WorkspaceFileAccessSessionJwtPayload = JwtPayload &
    WorkspaceFileAccessBinding & {
        sessionId: string
    }

export type WorkspaceFileAccessAuthorization = {
    session: WorkspaceFileAccessSessionRecord
    grant: WorkspaceFileAccessGrantRecord
}

export type WorkspaceFileAccessResolvedFile = {
    volume: VolumeHandle
    filePath: string
}

type WorkspaceFileAccessCookie = {
    name: string
    value: string
    options: CookieOptions
}

export type WorkspaceFileAccessSessionCreation = XpertViewFileAccessSessionResult & {
    cookie: WorkspaceFileAccessCookie
}

@Injectable()
export class WorkspaceFileAccessService {
    constructor(
        @Inject(CACHE_MANAGER)
        private readonly cacheManager: Cache,
        private readonly configService: ConfigService,
        private readonly viewExtensionService: ViewExtensionService,
        @Inject(VOLUME_CLIENT)
        private readonly volumeClient: VolumeClient
    ) {}

    async createSession(
        input: { hostType: string; hostId: string; viewKey: string },
        request: Pick<Request, 'headers' | 'secure'>
    ): Promise<WorkspaceFileAccessSessionCreation> {
        const resolved = await this.viewExtensionService.resolveViewFileAccessContext(
            input.hostType,
            input.hostId,
            input.viewKey
        )
        const sessionId = randomUUID()
        const expiresAt = new Date(Date.now() + WORKSPACE_FILE_ACCESS_TTL_MS).toISOString()
        const session: WorkspaceFileAccessSessionRecord = {
            sessionId,
            tenantId: resolved.context.tenantId,
            organizationId: resolved.context.organizationId ?? null,
            userId: resolved.context.userId,
            hostType: resolved.context.hostType,
            hostId: resolved.context.hostId,
            viewKey: resolved.manifest.key,
            origin: readRequestOrigin(request),
            expiresAt
        }
        await this.cacheManager.set(this.sessionKey(sessionId), session, WORKSPACE_FILE_ACCESS_TTL_MS)

        const token = sign(
            {
                aud: WORKSPACE_FILE_ACCESS_AUDIENCE,
                sub: WORKSPACE_FILE_ACCESS_SUBJECT,
                sessionId,
                tenantId: session.tenantId,
                organizationId: session.organizationId,
                userId: session.userId,
                hostType: session.hostType,
                hostId: session.hostId,
                viewKey: session.viewKey
            },
            this.getJwtSecret(),
            { expiresIn: Math.floor(WORKSPACE_FILE_ACCESS_TTL_MS / 1000) }
        )

        return {
            sessionId,
            expiresAt,
            cookie: {
                name: WORKSPACE_FILE_ACCESS_COOKIE_NAME,
                value: token,
                options: {
                    httpOnly: true,
                    maxAge: WORKSPACE_FILE_ACCESS_TTL_MS,
                    path: this.buildCookiePath(sessionId),
                    sameSite: 'lax',
                    secure: request.secure || request.headers['x-forwarded-proto'] === 'https'
                }
            }
        }
    }

    async createGrant(sessionId: string, request: XpertViewFileAccessRequest): Promise<XpertViewFileAccessGrantResult> {
        const session = await this.requireAuthenticatedSession(sessionId)
        const resolved = await this.viewExtensionService.resolveViewFileResource(
            session.hostType,
            session.hostId,
            session.viewKey,
            request
        )
        this.assertContextMatchesSession(session, {
            tenantId: resolved.context.tenantId,
            organizationId: resolved.context.organizationId ?? null,
            userId: resolved.context.userId,
            hostType: resolved.context.hostType,
            hostId: resolved.context.hostId,
            viewKey: resolved.manifest.key
        })
        this.assertPortableReference(session, resolved.resource.reference)

        const grantId = randomUUID()
        const fileName = normalizeFileName(resolved.resource.fileName)
        const expiresAt = session.expiresAt
        const grant: WorkspaceFileAccessGrantRecord = {
            ...bindingFromSession(session),
            sessionId,
            grantId,
            fileKey: request.fileKey,
            ...(request.targetId ? { targetId: request.targetId } : {}),
            purpose: request.purpose,
            reference: resolved.resource.reference,
            fileName,
            publicFileName: fileName,
            mimeType: resolved.resource.mimeType.trim(),
            ...(typeof resolved.resource.size === 'number' ? { size: resolved.resource.size } : {}),
            expiresAt
        }
        const ttl = Math.max(1, new Date(expiresAt).getTime() - Date.now())
        await this.cacheManager.set(this.grantKey(sessionId, grantId), grant, ttl)

        return {
            url: buildContentUrl(sessionId, grantId, grant.publicFileName),
            expiresAt,
            fileName,
            mimeType: grant.mimeType,
            ...(typeof grant.size === 'number' ? { size: grant.size } : {})
        }
    }

    async revokeSession(sessionId: string): Promise<void> {
        await this.requireAuthenticatedSession(sessionId)
        await this.cacheManager.del(this.sessionKey(sessionId))
    }

    async authorizeContent(
        sessionId: string,
        grantId: string,
        publicFileName: string,
        token: string
    ): Promise<WorkspaceFileAccessAuthorization> {
        const payload = this.verifySessionToken(token)
        if (!payload || payload.sessionId !== sessionId) {
            throw new UnauthorizedException(
                errorMessage('WorkspaceFileAccessInvalidSession', 'Workspace file access session is invalid.')
            )
        }

        const session = await this.cacheManager.get<WorkspaceFileAccessSessionRecord>(this.sessionKey(sessionId))
        if (!session || !sessionMatchesPayload(session, payload) || hasExpired(session.expiresAt)) {
            throw new UnauthorizedException(
                errorMessage('WorkspaceFileAccessInvalidSession', 'Workspace file access session is invalid.')
            )
        }
        const grant = await this.cacheManager.get<WorkspaceFileAccessGrantRecord>(this.grantKey(sessionId, grantId))
        if (
            !grant ||
            grant.sessionId !== sessionId ||
            grant.publicFileName !== publicFileName ||
            !bindingsMatch(session, grant) ||
            hasExpired(grant.expiresAt)
        ) {
            throw new NotFoundException(errorMessage('WorkspaceFileAccessNotFound', 'Workspace file was not found.'))
        }

        return { session, grant }
    }

    resolveAuthorizedFile(authorization: WorkspaceFileAccessAuthorization): WorkspaceFileAccessResolvedFile {
        const { session, grant } = authorization
        this.assertPortableReference(session, grant.reference)
        const resolved = resolveWorkspaceVolumeScope(grant.reference, {
            tenantId: session.tenantId,
            userId: grant.reference.userId ?? session.userId
        })
        if (!resolved) {
            throw new NotFoundException(errorMessage('WorkspaceFileAccessNotFound', 'Workspace file was not found.'))
        }
        const volume = this.volumeClient.resolve(resolved.volumeScope)
        return {
            volume,
            filePath: volume.path(grant.reference.filePath)
        }
    }

    assertRequestOrigin(session: WorkspaceFileAccessSessionRecord, request: Pick<Request, 'headers'>): string | null {
        const origin = readRequestOrigin(request)
        if (origin !== session.origin) {
            throw new ForbiddenException(errorMessage('WorkspaceFileAccessDenied', 'Workspace file access was denied.'))
        }
        return origin
    }

    buildCookiePath(sessionId: string): string {
        return `/api/workspace-files/content/${sessionId}`
    }

    private async requireAuthenticatedSession(sessionId: string): Promise<WorkspaceFileAccessSessionRecord> {
        const session = await this.cacheManager.get<WorkspaceFileAccessSessionRecord>(this.sessionKey(sessionId))
        if (!session || hasExpired(session.expiresAt)) {
            throw new NotFoundException(
                errorMessage('WorkspaceFileAccessNotFound', 'Workspace file access session was not found.')
            )
        }
        const current = {
            tenantId: RequestContext.currentTenantId(),
            organizationId: RequestContext.getOrganizationId(),
            userId: RequestContext.currentUserId()
        }
        if (
            !current.tenantId ||
            !current.userId ||
            session.tenantId !== current.tenantId ||
            session.organizationId !== (current.organizationId ?? null) ||
            session.userId !== current.userId
        ) {
            throw new NotFoundException(
                errorMessage('WorkspaceFileAccessNotFound', 'Workspace file access session was not found.')
            )
        }
        return session
    }

    private assertContextMatchesSession(
        session: WorkspaceFileAccessSessionRecord,
        context: WorkspaceFileAccessBinding
    ) {
        if (!bindingsMatch(session, context)) {
            throw new NotFoundException(errorMessage('WorkspaceFileAccessNotFound', 'Workspace file was not found.'))
        }
    }

    private assertPortableReference(
        session: WorkspaceFileAccessSessionRecord,
        reference: WorkspacePortableFileReference
    ) {
        if (
            reference.source !== 'platform.workspace.files' ||
            !reference.filePath?.trim() ||
            !reference.tenantId ||
            reference.tenantId !== session.tenantId
        ) {
            throw new BadRequestException(
                errorMessage(
                    'WorkspaceFileAccessInvalidReference',
                    'View file access requires a scoped Workspace Files reference.'
                )
            )
        }
    }

    private verifySessionToken(token: string): WorkspaceFileAccessSessionJwtPayload | null {
        try {
            const payload = verify(token, this.getJwtSecret(), { audience: WORKSPACE_FILE_ACCESS_AUDIENCE })
            return isSessionJwtPayload(payload) ? payload : null
        } catch {
            return null
        }
    }

    private getJwtSecret(): string {
        const secret = this.configService.get<string>('JWT_SECRET', { infer: true })
        if (!secret?.trim()) {
            throw new InternalServerErrorException(
                errorMessage('WorkspaceFileAccessUnavailable', 'Workspace file access is not configured.')
            )
        }
        return secret
    }

    private sessionKey(sessionId: string) {
        return `workspace-file-access:session:${sessionId}`
    }

    private grantKey(sessionId: string, grantId: string) {
        return `workspace-file-access:grant:${sessionId}:${grantId}`
    }
}

function bindingFromSession(session: WorkspaceFileAccessSessionRecord): WorkspaceFileAccessBinding {
    return {
        tenantId: session.tenantId,
        organizationId: session.organizationId,
        userId: session.userId,
        hostType: session.hostType,
        hostId: session.hostId,
        viewKey: session.viewKey
    }
}

function bindingsMatch(left: WorkspaceFileAccessBinding, right: WorkspaceFileAccessBinding) {
    return (
        left.tenantId === right.tenantId &&
        left.organizationId === right.organizationId &&
        left.userId === right.userId &&
        left.hostType === right.hostType &&
        left.hostId === right.hostId &&
        left.viewKey === right.viewKey
    )
}

function sessionMatchesPayload(
    session: WorkspaceFileAccessSessionRecord,
    payload: WorkspaceFileAccessSessionJwtPayload
) {
    return session.sessionId === payload.sessionId && bindingsMatch(session, payload)
}

function isSessionJwtPayload(value: string | JwtPayload): value is WorkspaceFileAccessSessionJwtPayload {
    return (
        typeof value !== 'string' &&
        value.sub === WORKSPACE_FILE_ACCESS_SUBJECT &&
        audienceIncludes(value.aud, WORKSPACE_FILE_ACCESS_AUDIENCE) &&
        isNonEmptyString(value.sessionId) &&
        isNonEmptyString(value.tenantId) &&
        (value.organizationId === null || typeof value.organizationId === 'string') &&
        isNonEmptyString(value.userId) &&
        isNonEmptyString(value.hostType) &&
        isNonEmptyString(value.hostId) &&
        isNonEmptyString(value.viewKey)
    )
}

function audienceIncludes(value: JwtPayload['aud'], expected: string) {
    return value === expected || (Array.isArray(value) && value.includes(expected))
}

function readRequestOrigin(request: Pick<Request, 'headers'>): string | null {
    const origin =
        firstHeaderValue(request.headers.origin) ?? originFromReferer(firstHeaderValue(request.headers.referer))
    if (!origin) {
        return null
    }
    try {
        const parsed = new URL(origin)
        return parsed.protocol === 'http:' || parsed.protocol === 'https:' ? parsed.origin : null
    } catch {
        return null
    }
}

function originFromReferer(value: string | null): string | null {
    if (!value) {
        return null
    }
    try {
        return new URL(value).origin
    } catch {
        return null
    }
}

function firstHeaderValue(value: string | string[] | undefined): string | null {
    const first = Array.isArray(value) ? value[0] : value
    return isNonEmptyString(first) ? first.trim() : null
}

function normalizeFileName(value: string) {
    const normalized = basename(value.trim())
        .replace(/[\u0000-\u001f\u007f]/g, '')
        .trim()
    return normalized || 'workspace-file'
}

function buildContentUrl(sessionId: string, grantId: string, fileName: string) {
    const path = `/api/workspace-files/content/${encodeURIComponent(sessionId)}/${encodeURIComponent(grantId)}/${encodeURIComponent(fileName)}`
    return new URL(path, ensureTrailingSlash(environment.baseUrl)).toString()
}

function ensureTrailingSlash(value: string) {
    return value.endsWith('/') ? value : `${value}/`
}

function hasExpired(expiresAt: string) {
    return new Date(expiresAt).getTime() <= Date.now()
}

function isNonEmptyString(value: unknown): value is string {
    return typeof value === 'string' && value.trim().length > 0
}

function errorMessage(key: string, defaultValue: string) {
    return t(`server-ai:Error.${key}`, { defaultValue })
}
