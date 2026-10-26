import './clawxpert-conversation-detail.test-setup'
import { signal } from '@angular/core'
import { TestBed } from '@angular/core/testing'
import { of, Subject } from 'rxjs'
import { IChatConversation } from '../../../@core'
import { ClawXpertConversationDetailComponent } from './clawxpert-conversation-detail.component'
import {
  configureConversationDetailTests,
  frequentQuestionsModule,
  getRuntimeInput,
  runtimeModule,
  settle
} from './clawxpert-conversation-detail.test-setup'
describe('ClawXpertConversationDetailComponent component.spec.ts', () => {
  const setup = configureConversationDetailTests()
  let facade: ReturnType<typeof setup>['facade']
  let aiThreadService: ReturnType<typeof setup>['aiThreadService']
  let conversationService: ReturnType<typeof setup>['conversationService']
  let artifactService: ReturnType<typeof setup>['artifactService']
  let viewExtensionApi: ReturnType<typeof setup>['viewExtensionApi']
  let groupWorkbenchApi: ReturnType<typeof setup>['groupWorkbenchApi']
  let skillTrialIntent: ReturnType<typeof setup>['skillTrialIntent']
  let workbenchViewUrlState: ReturnType<typeof setup>['workbenchViewUrlState']
  let hostEvents: ReturnType<typeof setup>['hostEvents']
  let projectApi: ReturnType<typeof setup>['projectApi']
  let projectPermissions: ReturnType<typeof setup>['projectPermissions']
  beforeEach(() => {
    ;({
      facade,
      aiThreadService,
      conversationService,
      artifactService,
      viewExtensionApi,
      groupWorkbenchApi,
      skillTrialIntent,
      workbenchViewUrlState,
      hostEvents,
      projectApi,
      projectPermissions
    } = setup())
  })
  it('waits for the dedicated group context before discovering shared views', async () => {
    const response = new Subject<{ assistantId: string; conversationId: string; projectId: string | null }>()
    groupWorkbenchApi.getContext.mockReturnValue(response)
    facade.group.set({ id: 'group-1' })
    const fixture = TestBed.createComponent(ClawXpertConversationDetailComponent)
    await settle(fixture)

    expect(groupWorkbenchApi.getContext).toHaveBeenCalledWith('group-1')
    expect(fixture.componentInstance.fixedViewHostId()).toBeNull()
    expect(viewExtensionApi.getSlotViews).not.toHaveBeenCalled()

    response.next({ assistantId: 'assistant-1', conversationId: 'shared-runtime', projectId: null })
    await settle(fixture)
    expect(viewExtensionApi.getSlotViews).toHaveBeenLastCalledWith('agent', 'assistant-1', 'agent.workbench', {
      runtimeScope: { groupId: 'group-1', projectId: null, conversationId: 'shared-runtime' }
    })
    expect(fixture.componentInstance.fixedViewHostId()).toBe('assistant-1')
  })
  it('does not discover personal views after group context access is denied', async () => {
    const response = new Subject<never>()
    groupWorkbenchApi.getContext.mockReturnValue(response)
    facade.group.set({ id: 'group-1' })
    const fixture = TestBed.createComponent(ClawXpertConversationDetailComponent)
    await settle(fixture)

    response.error(new Error('Forbidden'))
    await settle(fixture)
    expect(fixture.componentInstance.fixedViewHostId()).toBeNull()
    expect(fixture.componentInstance.viewRuntimeScope()).toEqual({ groupId: 'group-1' })
    expect(viewExtensionApi.getSlotViews).not.toHaveBeenCalled()
  })
  it('consumes a skill trial intent by opening a new ChatKit run with only that skill selected', async () => {
    const intent = {
      workspaceId: 'workspace-1',
      skillPackageId: 'skill-package-documents',
      label: 'Documents',
      prompt: 'Draft a project memo as a document',
      createdAt: Date.now()
    }
    const setThreadId = jest.fn().mockResolvedValue(undefined)
    const setRuntimeCapabilities = jest.fn().mockResolvedValue(undefined)
    const setComposerValue = jest.fn().mockResolvedValue(undefined)
    const focusComposer = jest.fn().mockResolvedValue(undefined)
    skillTrialIntent.peek.mockReturnValue(intent)
    skillTrialIntent.consume.mockReturnValue(intent)
    facade.threadId.set(null)
    runtimeModule.injectHostedAssistantChatkitControl.mockReturnValueOnce(
      signal({
        element: {},
        setThreadId,
        setRuntimeCapabilities,
        setComposerValue,
        focusComposer
      })
    )

    const fixture = TestBed.createComponent(ClawXpertConversationDetailComponent)
    await settle(fixture)
    await new Promise((resolve) => setTimeout(resolve, 0))
    await settle(fixture)

    expect(skillTrialIntent.consume).toHaveBeenCalled()
    expect(setThreadId).toHaveBeenCalledWith(null)
    const expectedSelection = {
      mode: 'allowlist',
      skills: {
        workspaceId: 'workspace-1',
        ids: ['skill-package-documents']
      },
      plugins: {
        nodeKeys: []
      },
      subAgents: {
        nodeKeys: []
      }
    }
    expect(setRuntimeCapabilities).toHaveBeenCalledWith(expectedSelection)
    expect(setComposerValue).toHaveBeenCalledWith({
      text: 'Draft a project memo as a document',
      runtimeCapabilities: expectedSelection,
      insertRuntimeCapabilities: true
    })
    expect(focusComposer).toHaveBeenCalled()
    expect(facade.suppressAutoResume()).toBe(true)
  })
  it('limits the embedded ChatKit column width for wide ClawXpert conversations', async () => {
    const fixture = TestBed.createComponent(ClawXpertConversationDetailComponent)
    await settle(fixture)

    expect(getRuntimeInput().layout).toEqual({
      maxWidth: '840px'
    })
  })
  it('forwards ChatKit Project changes to the workbench facade', async () => {
    facade.threadId.set(null)
    facade.projectId.set('project-1')

    const fixture = TestBed.createComponent(ClawXpertConversationDetailComponent)
    await settle(fixture)

    expect(getRuntimeInput().projectId?.()).toBe('project-1')
    getRuntimeInput().onProjectChange?.({ projectId: 'project-2' })

    expect(facade.onChatProjectChange).toHaveBeenCalledWith('project-2', undefined, undefined)
    getRuntimeInput().onProjectChange?.({ projectId: null, selection: { mode: 'none' } })
    expect(facade.onChatProjectChange).toHaveBeenLastCalledWith(null, undefined, { mode: 'none' })
  })
  it('keeps Project selection and creation enabled after a conversation starts', async () => {
    const fixture = TestBed.createComponent(ClawXpertConversationDetailComponent)
    await settle(fixture)

    expect(getRuntimeInput().composer?.().projects).toMatchObject({ enabled: true, createEnabled: true })
  })
  it('preserves Project selection while creation permission is absent or revoked', async () => {
    projectPermissions.hasPermission.mockReturnValue(false)
    const fixture = TestBed.createComponent(ClawXpertConversationDetailComponent)
    await settle(fixture)
    expect(getRuntimeInput().composer?.().projects).toMatchObject({
      enabled: true,
      createEnabled: false,
      autoNewEnabled: false
    })
    getRuntimeInput().onEffect?.({ name: 'project.create', data: { name: 'Denied project' } })
    await settle(fixture)
    expect(projectApi.create).not.toHaveBeenCalled()

    projectPermissions.hasPermission.mockReturnValue(true)
    projectPermissions.userRolePermissions$.next([])
    await settle(fixture)
    expect(getRuntimeInput().composer?.().projects?.createEnabled).toBe(true)

    projectPermissions.hasPermission.mockReturnValue(false)
    projectPermissions.userRolePermissions$.next([])
    await settle(fixture)
    expect(getRuntimeInput().composer?.().projects?.createEnabled).toBe(false)
  })
  it('keeps Project selection available before the first message, including after a Project is selected', async () => {
    facade.threadId.set(null)

    const fixture = TestBed.createComponent(ClawXpertConversationDetailComponent)
    await settle(fixture)

    expect(getRuntimeInput().composer?.().projects?.enabled).toBe(true)
    expect(getRuntimeInput().composer?.().projects?.createEnabled).toBe(true)

    facade.projectId.set('project-1')
    await settle(fixture)

    expect(getRuntimeInput().composer?.().projects?.enabled).toBe(true)
    expect(getRuntimeInput().composer?.().projects?.createEnabled).toBe(true)
  })
  it('enables the task summary only for the ClawXpert ChatKit runtime', async () => {
    const fixture = TestBed.createComponent(ClawXpertConversationDetailComponent)
    await settle(fixture)

    expect(getRuntimeInput().taskSummary).toEqual({ enabled: true })
  })
  it('binds automatic frequent questions only to the ready new-conversation screen', async () => {
    facade.threadId.set(null)
    const fixture = TestBed.createComponent(ClawXpertConversationDetailComponent)
    await settle(fixture)
    const input = frequentQuestionsModule.injectFrequentQuestionsStartScreen.mock.calls.at(-1)?.[0]

    expect(input.active()).toBe(true)
    expect(getRuntimeInput().startScreen).toBe(fixture.componentInstance.startScreen)
    facade.threadId.set('existing-thread')
    expect(input.active()).toBe(false)
    facade.threadId.set(null)
    facade.viewState.set('wizard')
    expect(input.active()).toBe(false)
  })
  it('updates project-bound data without replacing the same Assistant ChatKit element', async () => {
    facade.projectId.set('project-a')
    const fixture = TestBed.createComponent(ClawXpertConversationDetailComponent)
    await settle(fixture)
    const chatkitElement = fixture.nativeElement.querySelector('xpert-chatkit')
    expect(chatkitElement).not.toBeNull()
    facade.projectId.set('project-b')
    await settle(fixture)
    expect(getRuntimeInput().projectId?.()).toBe('project-b')
    expect(fixture.componentInstance.viewRuntimeScope().projectId).toBe('project-b')
    expect(fixture.nativeElement.querySelector('xpert-chatkit')).toBe(chatkitElement)
  })
  it('keeps a bound Project available to ChatKit without changing its mount scope', async () => {
    Object.assign(facade, { chatkitMountProjectId: signal(null) })
    const fixture = TestBed.createComponent(ClawXpertConversationDetailComponent)
    await settle(fixture)
    const chatkitElement = fixture.nativeElement.querySelector('xpert-chatkit')
    facade.projectId.set('auto-created-project')
    await settle(fixture)

    expect(getRuntimeInput().composer?.().projects).toMatchObject({ enabled: true, createEnabled: true })
    expect(getRuntimeInput().projectId?.()).toBeNull()
    expect(fixture.nativeElement.querySelector('xpert-chatkit')).toBe(chatkitElement)
    expect(projectApi.availableForXpert).not.toHaveBeenCalled()
  })
  it('shows the Project selector rail for a new conversation even without existing Projects', async () => {
    facade.threadId.set(null)

    const fixture = TestBed.createComponent(ClawXpertConversationDetailComponent)
    await settle(fixture)

    expect(projectApi.availableForXpert).not.toHaveBeenCalled()
    expect(getRuntimeInput().composer?.().projects?.enabled).toBe(true)
  })
  it.each([null, 'existing-thread'])('creates a Project and opens a new chat from thread %s', async (threadId) => {
    facade.threadId.set(threadId)

    const fixture = TestBed.createComponent(ClawXpertConversationDetailComponent)
    await settle(fixture)

    getRuntimeInput().onEffect?.({
      name: 'project.create',
      data: { name: '  Launch project  ' }
    })
    await settle(fixture)

    expect(projectApi.create).toHaveBeenCalledWith({
      name: 'Launch project',
      xpertIds: ['assistant-1']
    })
    expect(facade.onChatProjectChange).toHaveBeenCalledWith('project-created')
  })
  it('keeps the Project selector rail available after selecting a Project in a new conversation', async () => {
    facade.threadId.set(null)
    facade.projectId.set('project-1')

    const fixture = TestBed.createComponent(ClawXpertConversationDetailComponent)
    await settle(fixture)

    expect(projectApi.availableForXpert).not.toHaveBeenCalled()
    expect(getRuntimeInput().composer?.().projects?.enabled).toBe(true)
  })
  it('marks a route-resolved conversation read without waiting for ChatKit thread load callbacks', async () => {
    const fixture = TestBed.createComponent(ClawXpertConversationDetailComponent)
    await settle(fixture)

    expect(conversationService.markRead).toHaveBeenCalledWith('conversation-1')
  })
  it('marks a conversation read when ChatKit finishes loading the visible thread', async () => {
    const fixture = TestBed.createComponent(ClawXpertConversationDetailComponent)
    await settle(fixture)

    const runtimeInput = getRuntimeInput()
    conversationService.markRead.mockClear()

    runtimeInput.onThreadLoadEnd?.({ threadId: 'thread-1' })
    await settle(fixture)

    expect(conversationService.markRead).toHaveBeenCalledWith('conversation-1')
  })
  it('allows the embedded chatkit to shrink within compact viewport heights', async () => {
    const fixture = TestBed.createComponent(ClawXpertConversationDetailComponent)
    await settle(fixture)

    const chatkit = fixture.nativeElement.querySelector('xpert-chatkit') as HTMLElement | null
    const chatkitClasses = Array.from(chatkit?.classList ?? [])

    expect(chatkit).not.toBeNull()
    expect(chatkitClasses).toEqual(expect.arrayContaining(['block', 'h-full', 'min-h-0']))
    expect(chatkitClasses).not.toContain('min-h-[32rem]')
  })
  it('falls back to resolving the conversation by thread id when thread metadata does not include conversation id', async () => {
    aiThreadService.getThread.mockReturnValue(
      of({
        thread_id: 'thread-1',
        metadata: {}
      })
    )

    const fixture = TestBed.createComponent(ClawXpertConversationDetailComponent)
    await settle(fixture)

    expect(conversationService.getByThreadId).toHaveBeenCalledWith('thread-1')
    expect(conversationService.getById).toHaveBeenCalledWith('conversation-1', { relations: ['messages'] })
    expect(facade.setActiveConversation).toHaveBeenLastCalledWith(expect.objectContaining({ id: 'conversation-1' }))
  })
  it('navigates from a stale route thread to the conversation working thread', async () => {
    conversationService.getById.mockReturnValue(
      of({
        id: 'conversation-1',
        threadId: 'branch-b',
        projectId: 'project-1',
        status: 'idle',
        messages: []
      } as IChatConversation)
    )

    const fixture = TestBed.createComponent(ClawXpertConversationDetailComponent)
    await settle(fixture)

    expect(facade.onChatThreadChange).toHaveBeenCalledWith('branch-b')
    expect(facade.setActiveConversation).not.toHaveBeenCalledWith(expect.objectContaining({ id: 'conversation-1' }))
  })
  it('clears the shared active conversation when the thread is reset or the component is destroyed', async () => {
    const fixture = TestBed.createComponent(ClawXpertConversationDetailComponent)
    await settle(fixture)

    facade.setActiveConversation.mockClear()
    facade.threadId.set(null)
    await settle(fixture)

    expect(facade.setActiveConversation).toHaveBeenCalledWith(null)

    facade.setActiveConversation.mockClear()
    fixture.destroy()

    expect(facade.setActiveConversation).toHaveBeenCalledWith(null)
  })
  it('updates the shared sidebar status when a response starts and ends', async () => {
    runtimeModule.injectHostedAssistantChatkitControl.mockReturnValueOnce(
      signal({
        element: {},
        setThreadId: jest.fn().mockResolvedValue(undefined),
        setComposerValue: jest.fn().mockResolvedValue(undefined),
        focusComposer: jest.fn().mockResolvedValue(undefined)
      })
    )
    const fixture = TestBed.createComponent(ClawXpertConversationDetailComponent)
    await settle(fixture)

    const runtimeInput = getRuntimeInput()
    conversationService.markRead.mockClear()

    runtimeInput.onResponseStart?.()
    runtimeInput.onResponseEnd?.()
    await settle(fixture)

    expect(facade.patchActiveConversationStatus).toHaveBeenNthCalledWith(1, 'busy')
    expect(facade.patchActiveConversationStatus).toHaveBeenNthCalledWith(2, 'idle')
    expect(conversationService.markRead).toHaveBeenCalledWith('conversation-1')
  })
  it('asks the facade to resolve the preferred conversation entry when the route has no thread id', async () => {
    runtimeModule.injectHostedAssistantChatkitControl.mockReturnValueOnce(
      signal({
        element: {},
        setThreadId: jest.fn().mockResolvedValue(undefined),
        focusComposer: jest.fn()
      })
    )
    facade.threadId.set(null)

    const fixture = TestBed.createComponent(ClawXpertConversationDetailComponent)
    await settle(fixture)

    expect(facade.ensureConversationEntry).toHaveBeenCalled()
  })
  it('waits for user preferences to finish loading before resolving the preferred conversation entry', async () => {
    runtimeModule.injectHostedAssistantChatkitControl.mockReturnValueOnce(
      signal({
        element: {},
        setThreadId: jest.fn().mockResolvedValue(undefined),
        focusComposer: jest.fn()
      })
    )
    facade.threadId.set(null)
    facade.loadingUserPreference.set(true)

    const fixture = TestBed.createComponent(ClawXpertConversationDetailComponent)
    await settle(fixture)

    expect(facade.ensureConversationEntry).not.toHaveBeenCalled()

    facade.loadingUserPreference.set(false)
    await settle(fixture)

    expect(facade.ensureConversationEntry).toHaveBeenCalledTimes(1)
  })
  it('uses initialThread only at startup and pushes later route changes through setThreadId', async () => {
    const setThreadId = jest.fn().mockResolvedValue(undefined)
    runtimeModule.injectHostedAssistantChatkitControl.mockReturnValueOnce(
      signal({
        element: {},
        setThreadId,
        focusComposer: jest.fn()
      })
    )
    facade.threadId.set(null)

    const fixture = TestBed.createComponent(ClawXpertConversationDetailComponent)
    await settle(fixture)

    const runtimeInput = getRuntimeInput()
    expect(runtimeInput.initialThread?.()).toBeNull()
    expect(setThreadId).not.toHaveBeenCalled()

    facade.threadId.set('thread-2')
    await settle(fixture)

    expect(runtimeInput.initialThread?.()).toBe('thread-2')
    expect(setThreadId).toHaveBeenCalledWith('thread-2')
  })
  it('does not push a chatkit-originated new thread id back into the control', async () => {
    const setThreadId = jest.fn().mockResolvedValue(undefined)
    runtimeModule.injectHostedAssistantChatkitControl.mockReturnValueOnce(
      signal({
        element: {},
        setThreadId,
        focusComposer: jest.fn()
      })
    )
    facade.threadId.set(null)

    const fixture = TestBed.createComponent(ClawXpertConversationDetailComponent)
    await settle(fixture)

    setThreadId.mockClear()

    const runtimeInput = getRuntimeInput()
    runtimeInput.onThreadChange?.({ threadId: 'thread-new' })
    facade.threadId.set('thread-new')
    await settle(fixture)

    expect(facade.onChatThreadChange).toHaveBeenCalledWith('thread-new')
    expect(setThreadId).not.toHaveBeenCalledWith('thread-new')
  })
  it('publishes assistant tool completed host events from ChatKit tool-end logs', async () => {
    const publish = jest.spyOn(hostEvents, 'publish')
    const fixture = TestBed.createComponent(ClawXpertConversationDetailComponent)
    await settle(fixture)

    const runtimeInput = getRuntimeInput()
    runtimeInput.onLog?.({
      name: 'lg.tool.end',
      data: {
        toolName: 'excalidraw_patch_scene',
        toolCallId: 'call-1',
        argsPreview: '{"targetId":"target-1","updates":[{"id":"title","patch":{"text":"Observability"}}]}',
        durationMs: 73
      }
    })

    expect(publish).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'assistant.tool.completed',
        source: 'chatkit',
        receivedAt: expect.any(String),
        hostType: 'agent',
        hostId: 'assistant-1',
        dataScopeKey: 'user:user-1:personal:agent:assistant-1',
        threadId: 'thread-1',
        toolName: 'excalidraw_patch_scene',
        toolCallId: 'call-1',
        durationMs: 73,
        data: expect.objectContaining({
          toolName: 'excalidraw_patch_scene',
          argsPreview: expect.any(String)
        })
      })
    )
  })
})
