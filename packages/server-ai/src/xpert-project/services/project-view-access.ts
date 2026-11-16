import { ForbiddenException } from '@nestjs/common'
import { t } from 'i18next'
import type { TXpertProjectAccessRole, XpertViewProjectAccess } from '@xpert-ai/contracts'

export function toProjectViewAccess(role: TXpertProjectAccessRole | 'assistant', status?: string | null): XpertViewProjectAccess {
    if (role === 'assistant') throw new ForbiddenException(t('server-ai:Error.AssistantAccessForbidden'))
    const writable = status !== 'archived'
    return {
        role,
        canRead: true,
        canEdit: writable && role !== 'member',
        canManage: writable && (role === 'owner' || role === 'manager'),
        canUse: writable
    }
}
