import { ISandboxManagedService, SandboxManagedServiceErrorCode, TSandboxManagedServicePreviewSession } from '@xpert-ai/contracts'
import { Injectable } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { CookieOptions } from 'express'
import { JwtPayload, sign, verify } from 'jsonwebtoken'
import { SandboxManagedServiceError } from './sandbox-managed-service.error'

export const SANDBOX_PREVIEW_COOKIE_NAME = 'xpert_sandbox_preview'
const SANDBOX_PREVIEW_AUDIENCE = 'sandbox-preview'
const SANDBOX_PREVIEW_SUBJECT = 'sandbox-preview-session'
const SANDBOX_PREVIEW_TTL_MS = 60 * 60 * 1000

type SandboxPreviewSessionJwtPayload = JwtPayload & {
    conversationId: string
    serviceId: string
}

type SandboxPreviewSessionCookie = {
    name: string
    options: CookieOptions
    value: string
}

export type SandboxPreviewSessionResult = TSandboxManagedServicePreviewSession & {
    cookie: SandboxPreviewSessionCookie
}

function isNonEmptyString(value: unknown): value is string {
    return typeof value === 'string' && value.trim().length > 0
}

function isPreviewAudience(value: unknown): boolean {
    if (typeof value === 'string') {
        return value === SANDBOX_PREVIEW_AUDIENCE
    }

    return Array.isArray(value) && value.some((entry) => entry === SANDBOX_PREVIEW_AUDIENCE)
}

function isPreviewSessionPayload(value: string | JwtPayload): value is SandboxPreviewSessionJwtPayload {
    if (typeof value === 'string') {
        return false
    }

    return (
        isNonEmptyString(value.sub) &&
        value.sub === SANDBOX_PREVIEW_SUBJECT &&
        isPreviewAudience(value.aud) &&
        isNonEmptyString(value.conversationId) &&
        isNonEmptyString(value.serviceId)
    )
}

@Injectable()
export class SandboxPreviewSessionService {
    constructor(private readonly configService: ConfigService) {}

    createSession(service: ISandboxManagedService, options?: { secure?: boolean }): SandboxPreviewSessionResult {
        const previewUrl = service.previewUrl
        if (!service.id || !previewUrl || service.transportMode !== 'http') {
            throw new SandboxManagedServiceError(
                SandboxManagedServiceErrorCode.PreviewUnavailable,
                'Sandbox service does not expose an HTTP preview target.',
                400
            )
        }

        const expiresAt = new Date(Date.now() + SANDBOX_PREVIEW_TTL_MS)
        const token = sign(
            {
                aud: SANDBOX_PREVIEW_AUDIENCE,
                conversationId: service.conversationId,
                serviceId: service.id,
                sub: SANDBOX_PREVIEW_SUBJECT
            },
            this.getJwtSecret(),
            {
                expiresIn: Math.floor(SANDBOX_PREVIEW_TTL_MS / 1000)
            }
        )

        return {
            cookie: {
                name: SANDBOX_PREVIEW_COOKIE_NAME,
                options: {
                    httpOnly: true,
                    maxAge: SANDBOX_PREVIEW_TTL_MS,
                    path: this.buildCookiePath(service.conversationId, service.id),
                    sameSite: 'lax',
                    secure: options?.secure ?? false
                },
                value: token
            },
            expiresAt: expiresAt.toISOString(),
            previewUrl
        }
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

    buildCookiePath(conversationId: string, serviceId: string): string {
        return `/api/sandbox/conversations/${conversationId}/services/${serviceId}/proxy`
    }

    private getJwtSecret(): string {
        const secret = this.configService.get<string>('JWT_SECRET', { infer: true })
        if (!isNonEmptyString(secret)) {
            throw new SandboxManagedServiceError(
                SandboxManagedServiceErrorCode.ProviderUnavailable,
                'JWT secret is not configured for sandbox preview sessions.',
                500
            )
        }

        return secret
    }
}
