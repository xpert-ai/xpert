import { createEnvironmentInjector, EnvironmentInjector, signal } from '@angular/core'
import { TestBed } from '@angular/core/testing'
import { Router } from '@angular/router'
import type { ChatKitControl } from '@xpert-ai/chatkit-angular'
import type { ClawXpertConversationScope } from '@xpert-ai/contracts'
import { ClawXpertFacade } from './clawxpert.facade'
import { ClawXpertScopedConversationFacade } from './clawxpert-scoped-conversation.facade'
import { ClawXpertConversationEntryStore } from './clawxpert-conversation-entry.store'
import { CLAWXPERT_CONVERSATION_SCOPE } from './clawxpert-conversation-scope'

jest.mock('./clawxpert.facade', () => ({ ClawXpertFacade: class ClawXpertFacade {} }))

describe('isolated ClawXpert conversation entries', () => {
  let shared: ReturnType<typeof sharedFacade>
  let router: { url: string; navigateByUrl: jest.Mock }
  let injectors: EnvironmentInjector[]
  const owner = { userId: 'user-1', organizationId: 'org-1', xpertId: 'xpert-1' }

  function sharedFacade() {
    return {
      currentUrl: signal('/chat/clawxpert/c'),
      organizationId: signal('org-1'),
      userId: signal('user-1'),
      xpertId: signal('xpert-1'),
      assistantId: signal('xpert-1'),
      identity: signal('clawxpert'),
      viewState: signal('ready'),
      pendingConversationStartId: signal(0),
      beginPendingConversation: jest.fn(async (_id, control) => {
        await control.setThreadId(null)
      }),
      onChatThreadChange: jest.fn(),
      setActiveConversation: jest.fn()
    }
  }

  function facade(scope: ClawXpertConversationScope) {
    const injector = createEnvironmentInjector(
      [ClawXpertScopedConversationFacade, { provide: CLAWXPERT_CONVERSATION_SCOPE, useValue: signal(scope) }],
      TestBed.inject(EnvironmentInjector)
    )
    injectors.push(injector)
    const facade = injector.get(ClawXpertScopedConversationFacade)
    TestBed.flushEffects()
    return facade
  }

  function navigate(url: string) {
    router.url = url
    shared.currentUrl.set(url)
    TestBed.flushEffects()
  }

  beforeEach(() => {
    localStorage.clear()
    shared = sharedFacade()
    router = { url: shared.currentUrl(), navigateByUrl: jest.fn(() => Promise.resolve(true)) }
    injectors = []
    TestBed.configureTestingModule({
      providers: [
        { provide: ClawXpertFacade, useValue: shared },
        { provide: Router, useValue: router }
      ]
    })
  })

  afterEach(() => {
    for (const injector of injectors) injector.destroy()
    TestBed.resetTestingModule()
  })

  it('keeps task and assistant threads independent across route switches', () => {
    navigate('/chat/clawxpert/c/task-thread')
    const task = facade('task')
    navigate('/chat/clawxpert/assistant')
    const assistant = facade('assistant')
    expect(assistant.threadId()).toBeNull()
    assistant.onChatThreadChange('assistant-thread')
    expect(router.navigateByUrl).toHaveBeenCalledWith('/chat/clawxpert/assistant/assistant-thread')
    navigate('/chat/clawxpert/assistant/assistant-thread')
    navigate('/chat/clawxpert/c/task-thread')
    expect(task.threadId()).toBe('task-thread')
    expect(assistant.threadId()).toBe('assistant-thread')
    navigate('/chat/clawxpert/assistant')
    expect(router.navigateByUrl).toHaveBeenLastCalledWith('/chat/clawxpert/assistant/assistant-thread', {
      replaceUrl: true
    })
    expect(shared.onChatThreadChange).not.toHaveBeenCalled()
  })

  it('restores only the assistant entry persisted for this user, organization and binding', () => {
    TestBed.inject(ClawXpertConversationEntryStore).setAssistantThread(owner, 'saved-assistant')
    navigate('/chat/clawxpert/assistant')
    expect(facade('assistant').threadId()).toBe('saved-assistant')
    shared.organizationId.set('org-2')
    expect(facade('assistant').threadId()).toBeNull()
  })

  it('remembers a background assistant response without hijacking the task route', () => {
    navigate('/chat/clawxpert/assistant')
    const assistant = facade('assistant')
    navigate('/chat/clawxpert/c')
    router.navigateByUrl.mockClear()
    assistant.onChatThreadChange('background-thread')
    expect(assistant.threadId()).toBe('background-thread')
    expect(router.navigateByUrl).not.toHaveBeenCalled()
    expect(TestBed.inject(ClawXpertConversationEntryStore).assistantThread(owner)).toBe('background-thread')
  })

  it('does not reset an initialized blank composer when returning from another entry', async () => {
    const task = facade('task')
    const control = {
      setThreadId: jest.fn(),
      setRuntimeCapabilities: jest.fn(),
      focusComposer: jest.fn()
    } as unknown as ChatKitControl
    await task.ensureConversationEntry(control)
    navigate('/chat/clawxpert/assistant')
    navigate('/chat/clawxpert/c')
    await task.ensureConversationEntry(control)
    expect(control.setThreadId).toHaveBeenCalledTimes(1)
  })

  it('applies the explicit new-task action only to the task pane', async () => {
    const task = facade('task')
    navigate('/chat/clawxpert/assistant')
    const assistant = facade('assistant')
    shared.pendingConversationStartId.set(4)
    navigate('/chat/clawxpert/c')
    const control = { setThreadId: jest.fn(), setComposerValue: jest.fn() } as unknown as ChatKitControl
    expect(task.pendingConversationStartId()).toBe(4)
    expect(assistant.pendingConversationStartId()).toBe(0)
    await assistant.beginPendingConversation(4, control)
    expect(shared.beginPendingConversation).not.toHaveBeenCalled()
    await task.beginPendingConversation(4, control)
    expect(shared.beginPendingConversation).toHaveBeenCalledWith(4, control)
    expect(control.setComposerValue).toHaveBeenCalledWith({ text: '', reply: '', attachments: [], references: [] })
  })

  it('keeps the assistant thread when its settings dialog opens', () => {
    navigate('/chat/clawxpert/assistant/existing')
    const assistant = facade('assistant')
    navigate('/chat/clawxpert/settings')
    expect(assistant.threadId()).toBe('existing')
    expect(assistant.active()).toBe(true)
  })
  it('opens a newly created task thread even when the shared facade is waiting for a blank reset', () => {
    const task = facade('task')
    task.onChatThreadChange('new-task')
    expect(router.navigateByUrl).toHaveBeenCalledWith('/chat/clawxpert/c/new-task')
    expect(task.threadId()).toBe('new-task')
  })

  it('preserves workbench query parameters when the active assistant creates a thread', () => {
    navigate('/chat/clawxpert/assistant?view=review#details')
    const assistant = facade('assistant')
    assistant.onChatThreadChange('new-assistant')
    expect(router.navigateByUrl).toHaveBeenCalledWith('/chat/clawxpert/assistant/new-assistant?view=review#details')
  })
})
