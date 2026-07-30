import { createHmac, randomUUID } from 'node:crypto'
import { isIP } from 'node:net'
import {
    ISandboxManagedService,
    SandboxManagedServiceErrorCode,
    TSandboxManagedServicePreviewSession
} from '@xpert-ai/contracts'
import { Injectable } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { environment } from '@xpert-ai/server-config'
import { CookieOptions, Request } from 'express'
import { t } from 'i18next'
import { JwtPayload, sign, verify } from 'jsonwebtoken'
import { SandboxManagedServiceError } from './sandbox-managed-service.error'

// Preview content must stay on per-service browser origins independent from the trusted app and API.
// Bootstrap credentials remain in the URL fragment, then become host-only, service-scoped cookies.
// Keep production origins HTTPS-only; loopback HTTP exists only for local development.
export const SANDBOX_PREVIEW_COOKIE_NAME = '__Host-xpert_sandbox_preview'
const SANDBOX_PREVIEW_AUDIENCE = 'sandbox-preview'
const SANDBOX_PREVIEW_SUBJECT = 'sandbox-preview-session'
const SANDBOX_PREVIEW_BOOTSTRAP_AUDIENCE = 'sandbox-preview-bootstrap'
const SANDBOX_PREVIEW_BOOTSTRAP_SUBJECT = 'sandbox-preview-bootstrap-ticket'
const SANDBOX_PREVIEW_BOOTSTRAP_TTL_SECONDS = 60
const SANDBOX_PREVIEW_TTL_MS = 60 * 60 * 1000
const SANDBOX_PREVIEW_CACHE_KEY = '__xpert_preview'
const SANDBOX_PREVIEW_DEV_ORIGIN = 'http://localhost:3000'

type SandboxPreviewSessionJwtPayload = JwtPayload & {
    conversationId: string
    serviceId: string
}

type SandboxPreviewBootstrapJwtPayload = SandboxPreviewSessionJwtPayload & {
    sessionExpiresAt: number
    targetPath: string
}

type SandboxPreviewSessionCookie = {
    name: string
    options: CookieOptions
    value: string
}

export type SandboxPreviewBootstrapResult = {
    cookie?: SandboxPreviewSessionCookie
    redirectPath: string
}

type SandboxPreviewBinding = {
    conversationId: string
    serviceId: string
}

function isNonEmptyString(value: unknown): value is string {
    return typeof value === 'string' && value.trim().length > 0
}

function normalizeHostname(hostname: string): string {
    return hostname.replace(/^\[(.*)\]$/, '$1').toLowerCase()
}

function isLoopbackHostname(hostname: string): boolean {
    const normalized = normalizeHostname(hostname)
    if (normalized === 'localhost' || normalized.endsWith('.localhost') || normalized === '::1') {
        return true
    }

    return isIP(normalized) === 4 && normalized.startsWith('127.')
}

function getCookieSiteKey(hostname: string): string {
    const normalized = normalizeHostname(hostname)
    if (isLoopbackHostname(normalized) || isIP(normalized) !== 0) {
        return normalized
    }

    const labels = normalized.split('.').filter(Boolean)
    return labels.length > 1 ? labels.slice(-2).join('.') : normalized
}

function hasAudience(value: unknown, audience: string): boolean {
    if (typeof value === 'string') {
        return value === audience
    }

    return Array.isArray(value) && value.some((entry) => entry === audience)
}

function isPreviewSessionPayload(value: string | JwtPayload): value is SandboxPreviewSessionJwtPayload {
    if (typeof value === 'string') {
        return false
    }

    return (
        value.sub === SANDBOX_PREVIEW_SUBJECT &&
        hasAudience(value.aud, SANDBOX_PREVIEW_AUDIENCE) &&
        isNonEmptyString(value.conversationId) &&
        isNonEmptyString(value.serviceId)
    )
}

function isPreviewBootstrapPayload(value: string | JwtPayload): value is SandboxPreviewBootstrapJwtPayload {
    if (typeof value === 'string') {
        return false
    }

    return (
        value.sub === SANDBOX_PREVIEW_BOOTSTRAP_SUBJECT &&
        hasAudience(value.aud, SANDBOX_PREVIEW_BOOTSTRAP_AUDIENCE) &&
        isNonEmptyString(value.conversationId) &&
        isNonEmptyString(value.serviceId) &&
        isNonEmptyString(value.targetPath) &&
        typeof value.sessionExpiresAt === 'number' &&
        Number.isFinite(value.sessionExpiresAt)
    )
}

@Injectable()
export class SandboxPreviewSessionService {
    constructor(private readonly configService: ConfigService) {}

    createSession(service: ISandboxManagedService): TSandboxManagedServicePreviewSession {
        const targetPath = service.previewUrl
        if (!service.id || !targetPath || service.transportMode !== 'http') {
            throw new SandboxManagedServiceError(
                SandboxManagedServiceErrorCode.PreviewUnavailable,
                t('server-ai:Error.SandboxPreviewUnavailable', {
                    defaultValue: 'Sandbox service does not expose an HTTP preview target.'
                }),
                400
            )
        }

        const binding = {
            conversationId: service.conversationId,
            serviceId: service.id
        }
        const normalizedTargetPath = this.normalizeTargetPath(targetPath, binding)
        if (!normalizedTargetPath) {
            throw new SandboxManagedServiceError(
                SandboxManagedServiceErrorCode.PreviewUnavailable,
                t('server-ai:Error.SandboxPreviewTargetInvalid', {
                    defaultValue: 'Sandbox service exposes an invalid HTTP preview target.'
                }),
                400
            )
        }

        const expiresAt = new Date(Date.now() + SANDBOX_PREVIEW_TTL_MS)
        const ticket = sign(
            {
                aud: SANDBOX_PREVIEW_BOOTSTRAP_AUDIENCE,
                conversationId: binding.conversationId,
                serviceId: binding.serviceId,
                sessionExpiresAt: expiresAt.getTime(),
                sub: SANDBOX_PREVIEW_BOOTSTRAP_SUBJECT,
                targetPath: normalizedTargetPath
            },
            this.getJwtSecret(),
            {
                expiresIn: SANDBOX_PREVIEW_BOOTSTRAP_TTL_SECONDS
            }
        )
        const previewUrl = new URL(
            this.buildBootstrapPath(binding.conversationId, binding.serviceId),
            this.getPreviewOrigin(binding)
        )
        previewUrl.searchParams.set(SANDBOX_PREVIEW_CACHE_KEY, randomUUID())
        previewUrl.hash = new URLSearchParams({
            target: normalizedTargetPath,
            ticket
        }).toString()

        return {
            expiresAt: expiresAt.toISOString(),
            previewUrl: previewUrl.toString()
        }
    }

    bootstrapSession(input: {
        conversationId: string
        request: Request
        serviceId: string
        targetPath?: string
        ticket?: string
    }): SandboxPreviewBootstrapResult | null {
        const binding = {
            conversationId: input.conversationId,
            serviceId: input.serviceId
        }
        if (!this.isPreviewRequest(input.request, binding)) {
            return null
        }

        const targetPath = this.normalizeTargetPath(input.targetPath, binding)
        if (!targetPath) {
            return null
        }

        const existingSession = this.readAndVerifySession(input.request)
        if (existingSession && this.matchesBinding(existingSession, binding)) {
            return {
                redirectPath: targetPath
            }
        }

        if (!isNonEmptyString(input.ticket)) {
            return null
        }

        const bootstrap = this.verifyBootstrapTicket(input.ticket)
        if (
            !bootstrap ||
            !this.matchesBinding(bootstrap, binding) ||
            bootstrap.targetPath !== targetPath ||
            bootstrap.sessionExpiresAt <= Date.now()
        ) {
            return null
        }

        return {
            cookie: this.createSessionCookie(binding, bootstrap.sessionExpiresAt),
            redirectPath: targetPath
        }
    }

    authorizeRequest(request: Request, binding: SandboxPreviewBinding): boolean {
        if (!this.isPreviewRequest(request, binding)) {
            return false
        }

        const session = this.readAndVerifySession(request)
        return !!session && this.matchesBinding(session, binding)
    }

    verifySession(token: string): SandboxPreviewSessionJwtPayload | null {
        try {
            const payload = verify(token, this.getJwtSecret(), {
                audience: SANDBOX_PREVIEW_AUDIENCE
            })
            return isPreviewSessionPayload(payload) ? payload : null
        } catch {
            return null
        }
    }

    buildBootstrapPath(conversationId: string, serviceId: string): string {
        return `${this.buildServicePath(conversationId, serviceId)}/preview-bootstrap`
    }

    buildProxyPath(conversationId: string, serviceId: string): string {
        return `${this.buildServicePath(conversationId, serviceId)}/proxy`
    }

    private buildServicePath(conversationId: string, serviceId: string): string {
        return `/api/sandbox/conversations/${conversationId}/services/${serviceId}`
    }

    private createSessionCookie(binding: SandboxPreviewBinding, expiresAt: number): SandboxPreviewSessionCookie {
        const maxAge = Math.max(1, expiresAt - Date.now())
        const token = sign(
            {
                aud: SANDBOX_PREVIEW_AUDIENCE,
                conversationId: binding.conversationId,
                serviceId: binding.serviceId,
                sub: SANDBOX_PREVIEW_SUBJECT
            },
            this.getJwtSecret(),
            {
                expiresIn: Math.max(1, Math.ceil(maxAge / 1000))
            }
        )
        return {
                name: SANDBOX_PREVIEW_COOKIE_NAME,
                options: {
                    httpOnly: true,
                maxAge,
                partitioned: true,
                path: '/',
                sameSite: 'none',
                secure: true
                },
                value: token
        }
    }

    private getPreviewOrigin(binding: SandboxPreviewBinding): URL {
        const previewUrl = this.getPreviewBaseOrigin()
        const serviceKey = createHmac('sha256', this.getJwtSecret())
            .update(`${binding.conversationId}\0${binding.serviceId}`)
            .digest('hex')
            .slice(0, 52)
        const baseHostname = normalizeHostname(previewUrl.hostname)
        if (isIP(baseHostname) !== 0 && !isLoopbackHostname(baseHostname)) {
            throw this.invalidPreviewOrigin(
                t('server-ai:Error.SandboxPreviewOriginDnsRequired', {
                    defaultValue: 'Sandbox preview origin must use a DNS hostname that supports per-service subdomains.'
                })
            )
        }
        previewUrl.hostname = isIP(baseHostname) === 0 ? `s-${serviceKey}.${baseHostname}` : `s-${serviceKey}.localhost`
        this.assertIndependentOrigin(previewUrl, 'CLIENT_BASE_URL')
        this.assertIndependentOrigin(previewUrl, 'API_BASE_URL')
        return previewUrl
    }

    private getPreviewBaseOrigin(): URL {
        const configuredValue = this.configService.get<string>('SANDBOX_PREVIEW_BASE_URL', { infer: true })
        const rawValue =
            isNonEmptyString(configuredValue) || environment.envName !== 'dev'
                ? configuredValue
                : SANDBOX_PREVIEW_DEV_ORIGIN
        if (!isNonEmptyString(rawValue)) {
            throw this.invalidPreviewOrigin(
                t('server-ai:Error.SandboxPreviewOriginNotConfigured', {
                    defaultValue: 'Sandbox preview origin is not configured.'
                })
            )
        }

        let previewUrl: URL
        try {
            previewUrl = new URL(rawValue)
        } catch {
            throw this.invalidPreviewOrigin(
                t('server-ai:Error.SandboxPreviewOriginInvalid', {
                    defaultValue: 'Sandbox preview origin is invalid.'
                })
            )
        }

        if (
            (previewUrl.protocol !== 'http:' && previewUrl.protocol !== 'https:') ||
            previewUrl.username ||
            previewUrl.password ||
            previewUrl.pathname !== '/' ||
            previewUrl.search ||
            previewUrl.hash
        ) {
            throw this.invalidPreviewOrigin(
                t('server-ai:Error.SandboxPreviewOriginShapeInvalid', {
                    defaultValue: 'Sandbox preview origin must be an HTTP(S) origin without a path.'
                })
            )
        }

        if (previewUrl.protocol !== 'https:' && !isLoopbackHostname(previewUrl.hostname)) {
            throw this.invalidPreviewOrigin(
                t('server-ai:Error.SandboxPreviewOriginHttpsRequired', {
                    defaultValue: 'Public sandbox preview origins must use HTTPS.'
                })
            )
        }

        return previewUrl
    }

    private assertIndependentOrigin(previewUrl: URL, configKey: string): void {
        const configuredValue = this.configService.get<string>(configKey, { infer: true })
        const rawValue = isNonEmptyString(configuredValue)
            ? configuredValue
            : configKey === 'CLIENT_BASE_URL'
              ? environment.clientBaseUrl
              : environment.baseUrl
        if (!isNonEmptyString(rawValue)) {
            return
        }

        let applicationUrl: URL
        try {
            applicationUrl = new URL(rawValue)
        } catch {
            throw this.invalidPreviewOrigin(
                t('server-ai:Error.SandboxPreviewOriginValidationFailed', {
                    configKey,
                    defaultValue: 'Cannot validate sandbox preview isolation against {{configKey}}.'
                })
            )
        }

        const previewHostname = normalizeHostname(previewUrl.hostname)
        const applicationHostname = normalizeHostname(applicationUrl.hostname)
        if (
            previewHostname === applicationHostname ||
            (!isLoopbackHostname(previewHostname) &&
                !isLoopbackHostname(applicationHostname) &&
                getCookieSiteKey(previewHostname) === getCookieSiteKey(applicationHostname))
        ) {
            throw this.invalidPreviewOrigin(
                t('server-ai:Error.SandboxPreviewOriginNotIndependent', {
                    defaultValue:
                        'Sandbox preview origin must use a hostname and cookie site independent from the application and API.'
                })
            )
        }
    }

    private invalidPreviewOrigin(message: string): SandboxManagedServiceError {
        return new SandboxManagedServiceError(SandboxManagedServiceErrorCode.ProviderUnavailable, message, 500)
    }

    private isPreviewRequest(request: Request, binding: SandboxPreviewBinding): boolean {
        const host = request.headers.host
        return isNonEmptyString(host) && host.trim().toLowerCase() === this.getPreviewOrigin(binding).host.toLowerCase()
    }

    private normalizeTargetPath(targetPath: string | undefined, binding: SandboxPreviewBinding): string | null {
        if (!isNonEmptyString(targetPath) || !targetPath.startsWith('/')) {
            return null
        }

        let parsedUrl: URL
        try {
            parsedUrl = new URL(targetPath, 'http://sandbox-preview.invalid')
        } catch {
            return null
        }

        if (parsedUrl.origin !== 'http://sandbox-preview.invalid') {
            return null
        }

        const proxyPath = this.buildProxyPath(binding.conversationId, binding.serviceId)
        if (parsedUrl.pathname !== proxyPath && !parsedUrl.pathname.startsWith(`${proxyPath}/`)) {
            return null
        }

        return `${parsedUrl.pathname}${parsedUrl.search}${parsedUrl.hash}`
    }

    private readAndVerifySession(request: Request): SandboxPreviewSessionJwtPayload | null {
        const token = this.readCookieValue(request.headers.cookie, SANDBOX_PREVIEW_COOKIE_NAME)
        return token ? this.verifySession(token) : null
    }

    private readCookieValue(cookieHeader: string | undefined, cookieName: string): string | null {
        if (!cookieHeader) {
            return null
        }

        for (const segment of cookieHeader.split(';')) {
            const trimmed = segment.trim()
            const separatorIndex = trimmed.indexOf('=')
            if (separatorIndex <= 0 || trimmed.slice(0, separatorIndex).trim() !== cookieName) {
                continue
            }

            const rawValue = trimmed.slice(separatorIndex + 1)
            try {
                return decodeURIComponent(rawValue)
            } catch {
                return rawValue
            }
        }

        return null
    }

    private verifyBootstrapTicket(token: string): SandboxPreviewBootstrapJwtPayload | null {
        try {
            const payload = verify(token, this.getJwtSecret(), {
                audience: SANDBOX_PREVIEW_BOOTSTRAP_AUDIENCE
            })
            return isPreviewBootstrapPayload(payload) ? payload : null
        } catch {
            return null
        }
    }

    private matchesBinding(payload: SandboxPreviewSessionJwtPayload, binding: SandboxPreviewBinding): boolean {
        return payload.conversationId === binding.conversationId && payload.serviceId === binding.serviceId
    }

    private getJwtSecret(): string {
        const secret = this.configService.get<string>('JWT_SECRET', { infer: true })
        if (!isNonEmptyString(secret)) {
            throw new SandboxManagedServiceError(
                SandboxManagedServiceErrorCode.ProviderUnavailable,
                t('server-ai:Error.SandboxPreviewJwtSecretMissing', {
                    defaultValue: 'JWT secret is not configured for sandbox preview sessions.'
                }),
                500
            )
        }

        return secret
    }
}
