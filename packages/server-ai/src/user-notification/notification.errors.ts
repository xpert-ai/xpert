import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common'
import { t } from 'i18next'

export function notificationError(code: 'invalid' | 'denied' | 'conflict' | 'unavailable') {
    const defaults = {
        invalid: 'The notification request is invalid.',
        denied: 'You do not have access to this notification operation.',
        conflict: 'This announcement changed. Reload before saving.',
        unavailable: 'This notification is no longer available.'
    }
    const body = {
        code: `NOTIFICATION_${code.toUpperCase()}`,
        message: t(`server-ai:Error.Notification_${code}`, { defaultValue: defaults[code] })
    }
    if (code === 'denied') return new ForbiddenException(body)
    if (code === 'conflict') return new ConflictException(body)
    if (code === 'unavailable') return new NotFoundException(body)
    return new BadRequestException(body)
}
