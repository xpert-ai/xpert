import { ForbiddenException } from '@nestjs/common'
import { RequestContext } from '@xpert-ai/plugin-sdk'
import { t } from 'i18next'

/** Check the request's entry Assistant; delegated resource targets have their own access checks. */
export function assertAssistantAudience(assistantId: string) {
    const scope = RequestContext.currentApiPrincipal()?.resourceScope
    if (scope?.kind === 'conversation' || (scope?.kind === 'assistant' && scope.xpertId !== assistantId)) {
        throw new ForbiddenException(t('server-ai:Error.AssistantAccessForbidden'))
    }
}
