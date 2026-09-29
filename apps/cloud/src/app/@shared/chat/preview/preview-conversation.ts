import {
  AiThreadService,
  ChatConversationService,
  getErrorMessage,
  IChatConversation,
  IChatMessage,
  PaginationParams
} from '@cloud/app/@core'
import { catchError, forkJoin, map, Observable, of, switchMap } from 'rxjs'
import { filterLatestMessages } from '../filter-latest-messages'
import { applyDisplayPauseSnapshot } from './preview-display-pause'

type PreviewConversationReader = Pick<ChatConversationService, 'getOneById' | 'searchMessages'>
type PreviewThreadReader = Pick<AiThreadService, 'getThread'>

export type PreviewConversationLoadState = {
  conversation: Partial<IChatConversation> | null
  error: string | null
}

const PREVIEW_CONVERSATION_RELATIONS: PaginationParams<IChatConversation>['relations'] = [
  'xpert',
  'xpert.agent',
  'xpert.agents',
  'executions'
]

export function normalizePreviewThreadId(threadId: string | null | undefined): string | null {
  return typeof threadId === 'string' && threadId.trim() ? threadId.trim() : null
}

export function selectPreviewMessages(
  items: IChatMessage[],
  threadId: string | null,
  snapshot?: string | null
): IChatMessage[] {
  if (threadId) {
    return applyDisplayPauseSnapshot(items, snapshot)
  }
  return filterLatestMessages(items) ?? items
}

function readThreadDisplaySnapshot(thread: { displayPause?: { snapshot?: string } | null } | null): string | null {
  const snapshot = thread?.displayPause?.snapshot
  return typeof snapshot === 'string' && snapshot.trim() ? snapshot : null
}

export function loadPreviewConversation(
  conversationService: PreviewConversationReader,
  conversationId: string | null | undefined,
  organizationId?: string,
  threadService?: PreviewThreadReader
): Observable<PreviewConversationLoadState> {
  if (!conversationId) {
    return of({ conversation: null, error: null })
  }

  return conversationService
    .getOneById(
      conversationId,
      {
        relations: [...PREVIEW_CONVERSATION_RELATIONS]
      },
      organizationId
    )
    .pipe(
      switchMap((conversation) => {
        const threadId = normalizePreviewThreadId(conversation.threadId)
        const messages$ = conversationService.searchMessages(
          conversationId,
          { threadId: threadId ?? undefined },
          organizationId
        )
        const thread$ =
          threadId && threadService ? threadService.getThread(threadId).pipe(catchError(() => of(null))) : of(null)
        return forkJoin({ page: messages$, thread: thread$ }).pipe(
          map(({ page, thread }) => ({
            conversation: {
              ...conversation,
              messages: selectPreviewMessages(page.items, threadId, readThreadDisplaySnapshot(thread))
            },
            error: null
          }))
        )
      }),
      catchError((error) => of({ conversation: null, error: getErrorMessage(error) }))
    )
}
