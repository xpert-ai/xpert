import { DestroyRef, inject, provideEnvironmentInitializer } from '@angular/core'
import { Router } from '@angular/router'
import { EVENT_INBOX_VIEW_KEY, parseOpenConversationAction } from '@xpert-ai/contracts'
import { firstValueFrom } from 'rxjs'
import { z } from 'zod/v3'
import { Store } from '../../@core/state/store.service'
import { ViewExtensionApiService } from '../../@core/services/view-extension-api.service'
import { openConversation } from '../../@shared/notifications/open-conversation'
import { ViewClientCommandRegistry } from '../../@shared/view-extension/view-client-command-registry.service'

const input = z.object({ receiptId: z.string().uuid() }).strict()
const detail = z.object({ id: z.string().uuid(), conversationAction: z.unknown() })

export function provideInboxConversationCommand() {
  return provideEnvironmentInitializer(() => {
    const api = inject(ViewExtensionApiService)
    const router = inject(Router)
    const store = inject(Store)
    const unregister = inject(ViewClientCommandRegistry).register('open_conversation', async (value, context) => {
      const ref = input.safeParse(value)
      if (context.viewKey !== EVENT_INBOX_VIEW_KEY || !ref.success) return { success: false }
      const user = store.user?.id
      const org = store.organizationId
      const route = router.url
      const result = await firstValueFrom(
        api.getViewData(context.hostType, context.hostId, context.viewKey, { selectionId: ref.data.receiptId }, context.runtimeScope)
      )
      const item = detail.safeParse(result.item)
      if (!item.success || item.data.id !== ref.data.receiptId || !item.data.conversationAction) return { success: false }
      if (!user || user !== store.user?.id || !org || org !== store.organizationId || route !== router.url) return { success: false }
      return { success: await openConversation(router, parseOpenConversationAction(item.data.conversationAction)) }
    })
    inject(DestroyRef).onDestroy(unregister)
  })
}
