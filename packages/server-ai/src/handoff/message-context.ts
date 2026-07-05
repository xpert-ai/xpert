import { HandoffMessage } from '@xpert-ai/plugin-sdk'
import { captureRequestContext, runWithCapturedRequestContext } from '../shared/request-context'

export function getHandoffMessageHeader(message: HandoffMessage, key: string): string | undefined {
    const value = message.headers?.[key]
    if (typeof value === 'string' && value.length > 0) {
        return value
    }
    return undefined
}

export function getHandoffMessageOrganizationId(message: HandoffMessage): string | undefined {
    return getHandoffMessageHeader(message, 'organizationId')
}

export async function runWithHandoffMessageContext<T>(message: HandoffMessage, task: () => Promise<T>): Promise<T> {
    const organizationId = getHandoffMessageOrganizationId(message)
    const userId = getHandoffMessageHeader(message, 'userId')
    const language = getHandoffMessageHeader(message, 'language')
    const tenantId = typeof message.tenantId === 'string' && message.tenantId.length > 0 ? message.tenantId : undefined
    const user = tenantId
        ? {
              id: userId ?? undefined,
              tenantId
          }
        : undefined
    const headers: Record<string, string> = {
        ...(tenantId ? { ['tenant-id']: tenantId } : {}),
        ['x-scope-level']: organizationId ? 'organization' : 'tenant',
        ...(organizationId ? { ['organization-id']: organizationId } : {}),
        ...(language ? { language } : {})
    }

    // Handoff jobs can run outside the producer request, so rebuild scope from the
    // message envelope before resolving processors, retries, and dead-letter records.
    const context = captureRequestContext({
        user,
        tenantId,
        organizationId,
        language,
        headers
    })
    return runWithCapturedRequestContext(context, task)
}
