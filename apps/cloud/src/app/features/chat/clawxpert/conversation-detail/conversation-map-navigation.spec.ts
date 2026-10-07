import { Clipboard } from '@angular/cdk/clipboard'
import { signal } from '@angular/core'
import { TestBed } from '@angular/core/testing'
import { DefaultUrlSerializer, NavigationEnd, Router } from '@angular/router'
import type { WorkbenchAssistantConversationResolution } from '@xpert-ai/contracts'
import { of, Subject, throwError } from 'rxjs'
import { ChatConversationService } from '../../../../@core/services/chat-conversation.service'
import { ViewClientCommandRegistry } from '../../../../@shared/view-extension/view-client-command-registry.service'
import { focusConversationMapMessage, installConversationMapLinks } from './conversation-map-navigation'

describe('conversation map message focus', () => {
  const anchor = { conversationId: 'conversation', threadId: 'side', messageId: 'message' }
  afterEach(() => jest.useRealTimers())
  it('keeps old conversation and execution requests compatible', async () => {
    await expect(
      focusConversationMapMessage({}, { conversationId: 'conversation', threadId: 'side' })
    ).resolves.toBeUndefined()
  })
  it('waits for a newly mounted message surface without retrying failed history', async () => {
    jest.useFakeTimers()
    const focusMessage = jest
      .fn()
      .mockResolvedValueOnce({ success: false, code: 'not_ready' })
      .mockResolvedValueOnce({ success: true })
    const result = focusConversationMapMessage({ focusMessage }, anchor)
    await jest.advanceTimersByTimeAsync(100)
    await result
    expect(focusMessage).toHaveBeenCalledTimes(2)
    expect(focusMessage).toHaveBeenLastCalledWith(anchor)
    focusMessage.mockReset().mockResolvedValue({ success: false, code: 'message_unavailable' })
    await expect(focusConversationMapMessage({ focusMessage }, anchor)).rejects.toThrow('message_unavailable')
    expect(focusMessage).toHaveBeenCalledTimes(1)
  })
  it('reports an incompatible ChatKit build instead of claiming successful location', async () => {
    await expect(focusConversationMapMessage({}, anchor)).rejects.toThrow('does not support')
  })
  it('distinguishes superseded navigation from a failed history lookup', async () => {
    const focusMessage = jest.fn().mockResolvedValue({ success: false, code: 'stale_context' })
    await expect(focusConversationMapMessage({ focusMessage }, anchor)).rejects.toMatchObject({ name: 'AbortError' })
    expect(focusMessage).toHaveBeenCalledTimes(1)
  })
})

describe('conversation map links', () => {
  const target: WorkbenchAssistantConversationResolution = {
    conversationId: 'conversation',
    threadId: 'side',
    messageId: 'message',
    xpertId: 'assistant',
    projectId: 'project',
    isExternalAssistant: false
  }
  const context = {
    hostType: 'agent',
    hostId: 'assistant',
    viewKey: 'map',
    manifest: {
      key: 'map',
      title: 'Map',
      hostType: 'agent',
      slot: 'agent.workbench.fixed',
      source: { provider: 'platform.conversation-map' },
      view: { type: 'remote_component' as const, component: { isolation: 'iframe' as const, entry: 'map' } },
      dataSource: { mode: 'platform' as const }
    }
  }
  const baseUrl = '/chat/x/assistant/c?view=map&viewParameters=%7B%22mode%22%3A%22tree%22%7D'
  const anchor = { conversationId: 'conversation', threadId: 'side', messageId: 'message' }
  const copyCommand = 'workbench.navigation.copy-link'
  let events: Subject<NavigationEnd>
  let router: { url: string; events: Subject<NavigationEnd>; parseUrl: DefaultUrlSerializer['parse'] }
  let copy: jest.Mock
  let resolve: jest.Mock
  let open: jest.Mock
  let onError: jest.Mock
  let ready: ReturnType<typeof signal<boolean>>
  let unregister: () => void

  beforeEach(() => {
    events = new Subject<NavigationEnd>()
    router = { url: baseUrl, events, parseUrl: (url) => new DefaultUrlSerializer().parse(url) }
    copy = jest.fn(() => true)
    resolve = jest.fn(() => of(target))
    open = jest.fn(async () => undefined)
    onError = jest.fn()
    ready = signal(true)
    TestBed.configureTestingModule({
      providers: [
        { provide: Router, useValue: router },
        { provide: Clipboard, useValue: { copy } },
        { provide: ChatConversationService, useValue: { resolveWorkbenchNavigation: resolve } }
      ]
    })
    unregister = TestBed.runInInjectionContext(() =>
      installConversationMapLinks({ ready, assistantId: () => 'assistant', open, onError })
    )
  })

  afterEach(() => {
    unregister()
    TestBed.resetTestingModule()
    events.complete()
  })

  it('authorizes the exact anchor before copying and keeps the selected View and layout', async () => {
    const response = new Subject<WorkbenchAssistantConversationResolution>()
    resolve.mockReturnValue(response)
    const pending = TestBed.inject(ViewClientCommandRegistry).execute(copyCommand, anchor, context)
    expect(resolve).toHaveBeenCalledWith('conversation', 'assistant', undefined, {
      threadId: 'side',
      messageId: 'message'
    })
    expect(copy).not.toHaveBeenCalled()
    response.next(target)
    await expect(pending).resolves.toEqual({ success: true, status: 'copied' })
    const copied = new URL(copy.mock.calls[0][0])
    expect(copied.pathname).toBe('/chat/x/assistant/c')
    expect(Object.fromEntries(copied.searchParams)).toEqual({
      view: 'map',
      viewParameters: '{"mode":"tree"}',
      mapConversation: 'conversation',
      mapThread: 'side',
      mapMessage: 'message'
    })
    response.complete()
  })

  it('does not copy unauthorized links and reports clipboard failure', async () => {
    const registry = TestBed.inject(ViewClientCommandRegistry)
    resolve.mockReturnValueOnce(throwError(() => new Error('forbidden')))
    await expect(registry.execute(copyCommand, anchor, context)).rejects.toThrow('forbidden')
    expect(copy).not.toHaveBeenCalled()
    copy.mockReturnValue(false)
    await expect(registry.execute(copyCommand, anchor, context)).resolves.toEqual({
      success: false,
      code: 'clipboard_unavailable'
    })
  })

  it('restores a link only when chat is ready and does not reopen it on unrelated URL changes', () => {
    ready.set(false)
    router.url = `${baseUrl}&mapConversation=conversation&mapThread=side&mapMessage=message`
    events.next(new NavigationEnd(1, router.url, router.url))
    TestBed.tick()
    expect(open).not.toHaveBeenCalled()
    ready.set(true)
    TestBed.tick()
    expect(open).toHaveBeenCalledWith({ ...anchor, preserveView: true })
    router.url += '&mode=focus'
    events.next(new NavigationEnd(2, router.url, router.url))
    TestBed.tick()
    expect(open).toHaveBeenCalledTimes(1)
  })

  it('unregisters the copy command when the host closes', async () => {
    unregister()
    await expect(
      TestBed.inject(ViewClientCommandRegistry).execute(copyCommand, anchor, context)
    ).resolves.toMatchObject({
      success: false,
      code: 'unsupported'
    })
    expect(resolve).not.toHaveBeenCalled()
  })
})
