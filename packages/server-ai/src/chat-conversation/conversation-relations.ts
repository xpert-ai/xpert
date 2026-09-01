import { ForbiddenException } from '@nestjs/common'
import { t } from 'i18next'

const SENSITIVE_CONVERSATION_RELATIONS = new Set(['attachments', 'fileAssets'])

/**
 * Generic relation expansion bypasses the per-file authorization layer, so
 * managed file relations must stay behind the dedicated authorized APIs.
 */
export function assertSafeChatConversationRelations(relations: unknown): asserts relations is string[] | undefined {
    if (relations === undefined) {
        return
    }

    if (
        !Array.isArray(relations) ||
        relations.some(
            (relation) =>
                typeof relation !== 'string' ||
                relation.split('.').some((segment) => SENSITIVE_CONVERSATION_RELATIONS.has(segment))
        )
    ) {
        throw new ForbiddenException(
            t('server-ai:Error.ConversationAccessDenied', {
                defaultValue: 'You do not have access to this conversation'
            })
        )
    }
}
