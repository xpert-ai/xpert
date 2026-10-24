import type { TChatRecoveryError, TChatRecoveryErrorCode } from '@xpert-ai/contracts'
import { ConflictException } from '@nestjs/common'
import { t } from 'i18next'

export function recoveryConflict(code: TChatRecoveryErrorCode, originalError?: string, sourceThreadId?: string) {
    const message =
        code === 'conversation_branch_selection_changed'
            ? t('server-ai:Error.ConversationBranchSelectionChanged', {
                  defaultValue: 'The conversation has changed. Refresh it and try again.'
              })
            : t('server-ai:Error.ConversationRetryUnavailable', { defaultValue: 'Retry is currently unavailable.' })
    return new ConflictException(
        { code, message } satisfies TChatRecoveryError,
        // Nest serializes only the response. Preserve diagnostics for server-side inspection.
        { cause: { originalError, sourceThreadId } }
    )
}
