import { BadRequestException, ConflictException, ForbiddenException } from '@nestjs/common'
import { t } from 'i18next'
import { redactCredentials } from '../shared/redact-credentials'

/** Display only the bounded error message; never expose credentials or stack frames. */
export function groupExecutionError(error?: string | null): string | undefined {
    return error ? redactCredentials(error.split(/\n\s+at\s/)[0]).slice(0, 2000) : undefined
}

export function groupDenied() {
    return new ForbiddenException(t('server-ai:Error.GroupAccessDenied'))
}
export function groupInvalid() {
    return new BadRequestException(t('server-ai:Error.GroupInputInvalid'))
}
export function groupConflict() {
    return new ConflictException(t('server-ai:Error.GroupMessageConflict'))
}
