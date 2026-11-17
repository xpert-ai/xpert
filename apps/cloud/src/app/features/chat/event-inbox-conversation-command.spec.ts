jest.mock('../../@core/services/view-extension-api.service', () => ({ ViewExtensionApiService: class {} }))

import { TestBed } from '@angular/core/testing'
import { Router } from '@angular/router'
import { EVENT_INBOX_VIEW_KEY } from '@xpert-ai/contracts'
import { Subject, of } from 'rxjs'
import { ViewExtensionApiService } from '../../@core/services/view-extension-api.service'
import { Store } from '../../@core/state/store.service'
import {
  ViewClientCommandContext,
  ViewClientCommandRegistry
} from '../../@shared/view-extension/view-client-command-registry.service'
import { OPEN_CONVERSATION_NAVIGATION } from '../../@shared/notifications/open-conversation'
import { provideInboxConversationCommand } from './event-inbox-conversation-command'

it('opens only the current receipt after rechecking its action in the same user and organization', async () => {
  const receiptId = '10000000-0000-4000-8000-000000000001'
  const action = {
    type: 'open_conversation',
    assistantId: '20000000-0000-4000-8000-000000000002',
    conversationId: '30000000-0000-4000-8000-000000000003',
    threadId: '40000000-0000-4000-8000-000000000004'
  }
  const response = { item: { id: receiptId, conversationAction: action } }
  const store = { user: { id: 'reader' }, organizationId: 'org' }
  const router = { url: '/chat/event-inbox', navigate: jest.fn().mockResolvedValue(true) }
  const api = { getViewData: jest.fn().mockReturnValue(of(response)) }
  TestBed.configureTestingModule({
    providers: [
      { provide: ViewExtensionApiService, useValue: api },
      { provide: Router, useValue: router },
      { provide: Store, useValue: store },
      provideInboxConversationCommand()
    ]
  })
  const registry = TestBed.inject(ViewClientCommandRegistry)
  const context = { hostType: 'user', hostId: 'me', viewKey: EVENT_INBOX_VIEW_KEY } as ViewClientCommandContext
  const open = (payload: unknown) => registry.execute('open_conversation', payload, context)

  expect(await open({ receiptId, conversationId: action.conversationId })).toEqual({ success: false })
  expect(api.getViewData).not.toHaveBeenCalled()
  expect(await open({ receiptId })).toEqual({ success: true })
  expect(router.navigate).toHaveBeenCalledWith(['/chat/x', action.assistantId, 'c', action.threadId], {
    info: OPEN_CONVERSATION_NAVIGATION
  })
  api.getViewData.mockReturnValueOnce(of({ item: { id: receiptId } }))
  expect(await open({ receiptId })).toEqual({ success: false })
  api.getViewData.mockReturnValueOnce(of({ item: { id: action.conversationId, conversationAction: action } }))
  expect(await open({ receiptId })).toEqual({ success: false })

  const delayed = new Subject<typeof response>()
  api.getViewData.mockReturnValueOnce(delayed)
  const pending = open({ receiptId })
  store.organizationId = 'another-org'
  delayed.next(response)
  expect(await pending).toEqual({ success: false })
  expect(router.navigate).toHaveBeenCalledTimes(1)
})
