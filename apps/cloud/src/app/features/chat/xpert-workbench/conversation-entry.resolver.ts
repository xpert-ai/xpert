import { inject } from '@angular/core'
import { RedirectCommand, Router, type ResolveFn } from '@angular/router'
import { TranslateService } from '@ngx-translate/core'
import type { ChatConversationEntry } from '@xpert-ai/contracts'
import { catchError, map, of } from 'rxjs'
import { AiFeatureEnum, ChatConversationService, Store, getErrorMessage } from '../../../@core'

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
  const resolveEntry = (entry: ChatConversationEntry | null) =>
    entry?.purpose !== 'group' && !store.hasFeatureEnabled(AiFeatureEnum.FEATURE_XPERT_CLAWXPERT)
      ? new RedirectCommand(router.createUrlTree(['/chat']))
      : { entry, organizationId, error: null }
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
