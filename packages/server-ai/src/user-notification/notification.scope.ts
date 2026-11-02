import { z } from 'zod/v3'
import { PermissionsEnum, UserType } from '@xpert-ai/contracts'
import { RequestContext } from '@xpert-ai/plugin-sdk'
import { notificationError } from './notification.errors'

export interface NotificationScope {
    tenantId: string
    userId: string
}
export function notificationScope(): NotificationScope {
    const user = RequestContext.currentUser()
    if (!user?.id || !user.tenantId || user.type === UserType.COMMUNICATION || RequestContext.currentApiPrincipal()) {
        throw notificationError('denied')
    }
    return { tenantId: user.tenantId, userId: user.id }
}
export function announcementManagementScope() {
    const scope = notificationScope()
    if (!RequestContext.hasPermission(PermissionsEnum.ANNOUNCEMENT_MANAGE)) throw notificationError('denied')
    return scope
}

export function notificationStreamLifetime() {
    const token: unknown = RequestContext.currentToken()
    // Authentication has already verified this token. Its expiry only shortens the stream lifetime.
    if (typeof token !== 'string') return 60000
    try {
        const claims = z
            .object({ exp: z.number().positive() })
            .parse(JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString('utf8')))
        return Math.max(1, Math.min(60000, claims.exp * 1000 - Date.now()))
    } catch {
        return 60000
    }
}
