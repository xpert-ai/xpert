import { ChatConversationService, getErrorMessage, IChatConversation, PaginationParams } from '@cloud/app/@core'
import { catchError, map, Observable, of, switchMap } from 'rxjs'

type PreviewConversationReader = Pick<ChatConversationService, 'getOneById' | 'getMessages'>

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

export function loadPreviewConversation(
  conversationService: PreviewConversationReader,
  conversationId: string | null | undefined,
  organizationId?: string
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
      switchMap((conversation) =>
        conversationService.getMessages(conversationId, organizationId).pipe(
          map(({ items }) => ({
            conversation: {
              ...conversation,
              messages: items
            },
            error: null
          }))
        )
      ),
      catchError((error) => of({ conversation: null, error: getErrorMessage(error) }))
    )
}
