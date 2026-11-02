import { Injectable } from '@nestjs/common'
import { t } from 'i18next'
import type { ChatConversation } from '../conversation.entity'
import { groupDenied } from '../../chat-group/group.errors'
import type { VolumeScope } from '../../shared/volume'

export type ConversationEnvironmentFileContext = {
    conversation: ChatConversation
    environmentId: string
}

/** Host policy returns only the authorized owner; tenant and environment remain conversation-bound. */
export type ConversationEnvironmentFilePolicy = (
    context: ConversationEnvironmentFileContext
) => Promise<{ userId: string } | null>

@Injectable()
export class ConversationEnvironmentFilesService {
    private policy?: ConversationEnvironmentFilePolicy

    register(policy: ConversationEnvironmentFilePolicy) {
        if (this.policy) {
            throw new Error(t('server-ai:Error.ConversationEnvironmentFilePolicyDuplicate'))
        }
        this.policy = policy
        return () => {
            if (this.policy === policy) this.policy = undefined
        }
    }

    /** The caller must authorize the conversation before resolving its environment files. */
    async resolve(context: ConversationEnvironmentFileContext): Promise<VolumeScope> {
        const { conversation, environmentId } = context
        const owner = await this.policy?.(context)
        // A group environment must be checked by its runtime host on every operation.
        if (!owner && conversation.purpose === 'group_assistant_runtime') throw groupDenied()
        return {
            tenantId: conversation.tenantId,
            catalog: 'environment',
            environmentId,
            userId: owner?.userId ?? conversation.createdById
        }
    }
}
