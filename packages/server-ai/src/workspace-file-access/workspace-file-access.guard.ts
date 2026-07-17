import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common'
import type { Request } from 'express'
import { t } from 'i18next'
import {
    WORKSPACE_FILE_ACCESS_COOKIE_NAME,
    WorkspaceFileAccessAuthorization,
    WorkspaceFileAccessService
} from './workspace-file-access.service'

export type WorkspaceFileAccessRequest = Request & {
    workspaceFileAccess?: WorkspaceFileAccessAuthorization
}

@Injectable()
export class WorkspaceFileAccessGuard implements CanActivate {
    constructor(private readonly service: WorkspaceFileAccessService) {}

    async canActivate(context: ExecutionContext): Promise<boolean> {
        const request = context.switchToHttp().getRequest<WorkspaceFileAccessRequest>()
        const token = readCookieValue(request.headers.cookie, WORKSPACE_FILE_ACCESS_COOKIE_NAME)
        if (!token) {
            throw new UnauthorizedException(
                t('server-ai:Error.WorkspaceFileAccessSessionRequired', {
                    defaultValue: 'Workspace file access session is required.'
                })
            )
        }
        request.workspaceFileAccess = await this.service.authorizeContent(
            request.params.sessionId,
            request.params.grantId,
            request.params.fileName,
            token
        )
        return true
    }
}

function readCookieValue(cookieHeader: string | undefined, cookieName: string): string | null {
    if (!cookieHeader) {
        return null
    }
    for (const segment of cookieHeader.split(';')) {
        const trimmed = segment.trim()
        const separatorIndex = trimmed.indexOf('=')
        if (separatorIndex <= 0 || trimmed.slice(0, separatorIndex).trim() !== cookieName) {
            continue
        }
        const value = trimmed.slice(separatorIndex + 1)
        try {
            return decodeURIComponent(value)
        } catch {
            return value
        }
    }
    return null
}
