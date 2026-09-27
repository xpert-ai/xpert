import { Injectable } from '@nestjs/common'
import { t } from 'i18next'
import type { ChatConversation } from './conversation.entity'

type ConversationInitializer = (conversation: ChatConversation) => Promise<void>

/** Await registered runtime bindings before returning a conversation to its caller. */
@Injectable()
export class ConversationInitializerRegistry {
    private readonly initializers = new Map<string, ConversationInitializer>()

    register(key: string, initialize: ConversationInitializer) {
        if (this.initializers.has(key))
            throw new Error(
                t('server-ai:Error.ConversationInitializerDuplicate', {
                    key,
                    defaultValue: 'Conversation initializer already registered: {{key}}'
                })
            )
        this.initializers.set(key, initialize)
        return () => {
            this.initializers.delete(key)
        }
    }

    async initialize(conversation: ChatConversation) {
        for (const initialize of this.initializers.values()) await initialize(conversation)
    }
}
