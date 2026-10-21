import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common'
import { t } from 'i18next'
export function definitionError(code: 'invalid' | 'conflict' | 'denied' | 'unavailable') {
    const messages = {
        invalid: ['AnalyticsDefinitionInvalid', 'Analytics definition is invalid'],
        conflict: ['AnalyticsDefinitionConflict', 'A newer version was published. Reload before publishing again.'],
        denied: ['AnalyticsAccessDenied', 'Analytics access denied'],
        unavailable: ['AnalyticsDefinitionUnavailable', 'Analytics definition is unavailable']
    }
    const [key, defaultValue] = messages[code]
    const body = {
        code: `ANALYTICS_DEFINITION_${code.toUpperCase()}`,
        message: t(`server-ai:Error.${key}`, { defaultValue })
    }
    switch (code) {
        case 'conflict':
            return new ConflictException(body)
        case 'denied':
            return new ForbiddenException(body)
        case 'unavailable':
            return new NotFoundException(body)
        default:
            return new BadRequestException(body)
    }
}
