import { applicationMetrics } from '../metrics/application-metrics'
import { BadRequestException, ForbiddenException, HttpException, HttpStatus } from '@nestjs/common'
import { t } from 'i18next'

const messages = {
    Unavailable: 'Model execution is disabled or unavailable in this context.',
    BridgeUnsupported:
        'This Chat bridge supports text and client tools only. Disable native reasoning, media, hosted tools and unsupported protocol options.',
    Invalid: 'The model execution configuration is invalid.',
    ConversationRequired: 'Create a conversation with the current Assistant before opening coding tools.',
    Denied: 'The execution authorization has expired, changed, or been revoked.',
    Budget: 'The configured execution token budget has been reached.',
    RateLimit:
        'The execution concurrency or request rate limit has been reached. Retry after an active request completes.',
    Model: 'The requested model is not available for this execution.',
    Unknown: 'The previous execution outcome is unknown; it will not be restarted automatically.'
}
export function executionError(code: keyof typeof messages) {
    applicationMetrics.recordModelExecution(code)
    const message = t(`server-ai:Error.ModelExecution${code}`, { defaultValue: messages[code] })
    return code === 'Budget' || code === 'RateLimit'
        ? new HttpException(message, HttpStatus.TOO_MANY_REQUESTS)
        : ['Invalid', 'BridgeUnsupported', 'ConversationRequired'].includes(code)
          ? new BadRequestException(message)
          : new ForbiddenException(message)
}
