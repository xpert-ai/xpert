import { ForbiddenException } from '@nestjs/common'
import { ApiKeyBindingType } from '@xpert-ai/contracts'
import { RequestContext } from '@xpert-ai/plugin-sdk'
import { t } from 'i18next'

/** Check the request's entry Assistant; delegated resource targets have their own access checks. */
export function assertAssistantAudience(assistantId: string) {
    const apiKey = RequestContext.currentApiKey()
    if (apiKey?.type === ApiKeyBindingType.ASSISTANT && apiKey.entityId !== assistantId) {
        throw new ForbiddenException(t('server-ai:Error.AssistantAccessForbidden'))
    }
}
