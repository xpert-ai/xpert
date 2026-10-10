import { BadRequestException, ConflictException, ForbiddenException } from '@nestjs/common'
import { t } from 'i18next'

export function groupDenied() {
    return new ForbiddenException(t('server-ai:Error.GroupAccessDenied'))
}
export function groupInvalid() {
    return new BadRequestException(t('server-ai:Error.GroupInputInvalid'))
}
export function groupConflict() {
    return new ConflictException(t('server-ai:Error.GroupMessageConflict'))
}
