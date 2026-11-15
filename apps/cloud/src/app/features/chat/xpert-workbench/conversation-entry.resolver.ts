import { inject } from '@angular/core'
import { RedirectCommand, Router, type ResolveFn } from '@angular/router'
import { TranslateService } from '@ngx-translate/core'
import type { ChatConversationEntry } from '@xpert-ai/contracts'
import { catchError, map, of } from 'rxjs'
import { AiFeatureEnum, ChatConversationService, Store, getErrorMessage } from '../../../@core'
import { OPEN_CONVERSATION_NAVIGATION } from '../../../@shared/notifications/open-conversation'

/** Route-scoped result; an entry error must block chat initialization rather than fall back to private chat. */
export type ConversationEntryResolution = {
  entry: ChatConversationEntry | null
  organizationId: string | null
  error: string | null
}

export const resolveConversationEntry: ResolveFn<ConversationEntryResolution> = (route) => {
  const threadId = route.paramMap.get('threadId')
  const store = inject(Store)
  const router = inject(Router)
  const translate = inject(TranslateService)
  const organizationId = store.organizationId ?? null
  // Group membership does not require the personal ClawXpert feature or binding.
  const fromOpenConversation = router.currentNavigation()?.extras.info === OPEN_CONVERSATION_NAVIGATION
  const resolveEntry = (entry: ChatConversationEntry | null) => {
    if (entry?.purpose === 'group' || store.hasFeatureEnabled(AiFeatureEnum.FEATURE_XPERT_CLAWXPERT)) {
      return { entry, organizationId, error: null }
    }
    const destination = fromOpenConversation && entry?.purpose === 'private' ? ['/chat/c', entry.id] : ['/chat']
    return new RedirectCommand(router.createUrlTree(destination))
  }
  if (!threadId) return resolveEntry(null)
  return inject(ChatConversationService)
    .getEntryByThreadId(threadId, organizationId ?? undefined)
    .pipe(
      map(resolveEntry),
      catchError((error) =>
        of({
          entry: null,
          organizationId,
          error: getErrorMessage(error) || translate.instant('XP.Chat.ClawXpert.LoadFailedDesc')
        })
      )
    )
}
