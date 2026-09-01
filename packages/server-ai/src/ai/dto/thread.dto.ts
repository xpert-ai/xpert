import { IUser, TChatConversationStatus } from '@xpert-ai/contracts'
import { pick } from '@xpert-ai/server-common'
import { UserPublicDTO } from '@xpert-ai/server-core'
import { Exclude, Expose, Transform } from 'class-transformer'
import { ChatConversation, ChatConversationThread } from '../../core/entities/internal'

@Exclude()
export class ThreadDTO {
    id: string

    @Expose({
        name: 'thread_id'
    })
    threadId: string

    @Expose()
    status: TChatConversationStatus

    @Expose({
        name: 'updated_at'
    })
    updatedAt?: Date

    @Expose({
        name: 'created_at'
    })
    createdAt?: Date

    @Transform(({ value }) => (value ? new UserPublicDTO(value) : null))
    @Expose({
        name: 'created_by'
    })
    createdBy?: IUser

    @Transform(({ value }) => (value ? new UserPublicDTO(value) : null))
    @Expose({
        name: 'updated_by'
    })
    updatedBy?: IUser

    @Expose()
    metadata: Record<string, unknown>

    @Expose()
    values: Record<string, unknown>

    constructor(conversation: ChatConversation, values?: Record<string, unknown>, thread?: ChatConversationThread) {
        Object.assign(this, conversation)
        if (thread) {
            this.threadId = thread.threadId
            this.status = thread.status
            this.createdAt = thread.createdAt
            this.updatedAt = thread.updatedAt
            this.createdBy = thread.createdBy
            this.updatedBy = thread.updatedBy
        }

        this.metadata = {
            ...pick(conversation, 'id', 'title', 'fromEndUserId'),
            conversation_id: conversation.id,
            assistant_id: conversation.xpertId,
            ...(thread?.metadata ?? {}),
            ...(thread?.parentThreadId ? { parent_thread_id: thread.parentThreadId } : {}),
            ...(thread?.forkedFromMessageId ? { forked_from_message_id: thread.forkedFromMessageId } : {})
        }
        this.values = values
    }
}
