import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common'
import { Request } from 'express'
import { SANDBOX_PREVIEW_COOKIE_NAME, SandboxPreviewSessionService } from './sandbox-preview-session.service'

function readCookieHeader(request: Request): string {
    const cookieHeader = request.headers.cookie
    if (typeof cookieHeader === 'string') {
        return cookieHeader
    }

    return ''
}

function readCookieValue(cookieHeader: string, cookieName: string): string | null {
    if (!cookieHeader) {
        return null
    }

    for (const segment of cookieHeader.split(';')) {
        const trimmed = segment.trim()
        if (!trimmed) {
            continue
        }

        const separatorIndex = trimmed.indexOf('=')
        if (separatorIndex <= 0) {
            continue
        }

        const name = trimmed.slice(0, separatorIndex).trim()
        if (name !== cookieName) {
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

@Injectable()
export class SandboxPreviewAuthGuard implements CanActivate {
    constructor(private readonly previewSessionService: SandboxPreviewSessionService) {}

    canActivate(context: ExecutionContext): boolean {
        const request = context.switchToHttp().getRequest<Request>()
        const conversationId = request.params.conversationId
        const serviceId = request.params.serviceId
        const token = readCookieValue(readCookieHeader(request), SANDBOX_PREVIEW_COOKIE_NAME)

        if (!token) {
            throw new UnauthorizedException('Sandbox preview session is required.')
        }

        const session = this.previewSessionService.verifySession(token)
        if (!session || session.conversationId !== conversationId || session.serviceId !== serviceId) {
            throw new UnauthorizedException('Sandbox preview session is invalid.')
        }

        return true
    }
}
