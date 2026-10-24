import type { Xpert } from '../xpert.entity'

export function assistantSharingLock(
    xpert: Pick<Xpert, 'id' | 'tenantId' | 'organizationId' | 'workspaceId' | 'type' | 'slug'>
) {
    return JSON.stringify([
        'assistant-sharing',
        xpert.tenantId,
        xpert.organizationId ?? null,
        xpert.workspaceId ?? null,
        xpert.type,
        xpert.slug || xpert.id
    ])
}
