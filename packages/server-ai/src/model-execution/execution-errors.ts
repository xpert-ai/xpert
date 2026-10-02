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
    Budget: 'The execution budget or concurrency limit has been reached.',
    Model: 'The requested model is not available for this execution.',
    InputLimit:
        'The request exceeds this execution’s input size limit. Reduce the context or start with a larger authorized limit.',
    OutputLimit: 'The requested output exceeds this execution’s output limit. Reduce max_tokens.',
    Unknown: 'The previous execution outcome is unknown; it will not be restarted automatically.'
}
export function executionError(code: keyof typeof messages) {
    applicationMetrics.recordModelExecution(code)
    const message = t(`server-ai:Error.ModelExecution${code}`, { defaultValue: messages[code] })
    return code === 'Budget'
        ? new HttpException(message, HttpStatus.TOO_MANY_REQUESTS)
        : ['Invalid', 'InputLimit', 'OutputLimit', 'BridgeUnsupported', 'ConversationRequired'].includes(code)
          ? new BadRequestException(message)
          : new ForbiddenException(message)
}
