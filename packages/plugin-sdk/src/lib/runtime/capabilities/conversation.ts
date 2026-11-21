import { createRuntimeCapability } from '../../core/runtime-capability'
import type { IMessageWidgetProvider, MessageWidgetReference } from '../../widgets/message-widget-provider/types'

export interface ConversationRuntimeApi {
  /** Binds a provider-owned Widget to an assistant reply in the current thread. */
  publishWidget(
    issuer: IMessageWidgetProvider,
    widget: Pick<MessageWidgetReference, 'provider' | 'widgetId'> & { messageId?: string }
  ): Promise<void>
}

export const ConversationRuntimeCapability = createRuntimeCapability<ConversationRuntimeApi>('platform.conversation')
