import { Injectable } from '@nestjs/common'
import type { ActionNotificationPresentation, ActionNotificationSource } from '@xpert-ai/contracts'

export interface ActionNotificationRecipient {
    tenantId: string
    userId: string
}

/** Domain adapters own visibility and live state. Notification storage grants no business authority. */
export interface ActionNotificationSourceProvider {
    readonly key: string
    resolve(
        recipient: ActionNotificationRecipient,
        source: ActionNotificationSource
    ): Promise<ActionNotificationPresentation | null>
}

@Injectable()
export class ActionNotificationSources {
    private readonly providers = new Map<string, ActionNotificationSourceProvider>()

    register(provider: ActionNotificationSourceProvider) {
        if (this.providers.has(provider.key)) throw new Error('ACTION_NOTIFICATION_SOURCE_DUPLICATE')
        this.providers.set(provider.key, provider)
    }

    resolve(recipient: ActionNotificationRecipient, source: ActionNotificationSource) {
        return this.providers.get(source.provider)?.resolve(recipient, source) ?? Promise.resolve(null)
    }
}
