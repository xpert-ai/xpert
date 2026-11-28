import { t } from 'i18next'
import { ConflictException } from '@nestjs/common'
import { ChatThreadPurpose } from '@xpert-ai/contracts'
import type { ChatConversationThread } from './conversation-thread.entity'

/** Include editing branches only; independent side chats must never be removed implicitly. */
export function getThreadDeletionLineage(root: ChatConversationThread, threads: ChatConversationThread[]) {
    const result = [root]
    const seen = new Set([root.threadId])
    for (let index = 0; index < result.length; index++) {
        for (const child of threads.filter((thread) => thread.parentThreadId === result[index].threadId)) {
            if (seen.has(child.threadId))
                throw new ConflictException(
                    t('server-ai:Error.ThreadDeletionInvalidLineage', { defaultValue: 'Invalid thread lineage' })
                )
            if (
                root.metadata.purpose !== ChatThreadPurpose.SideChat ||
                child.metadata.purpose !== ChatThreadPurpose.MessageEdit
            )
                throw new ConflictException(
                    t('server-ai:Error.ThreadDeletionHasIndependentBranches', {
                        defaultValue: 'A thread with independent child branches cannot be deleted'
                    })
                )
            seen.add(child.threadId)
            result.push(child)
        }
    }
    if (result.some((thread) => thread.status === 'busy' || thread.status === 'pausing'))
        throw new ConflictException(
            t('server-ai:Error.ThreadDeletionWhileRunning', { defaultValue: 'Stop the side chat before deleting it' })
        )
    return result
}
