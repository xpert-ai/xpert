jest.mock('../../../@core', () => ({
  AssistantBindingScope: {
    USER: 'user'
  },
  AssistantCode: {
    CLAWXPERT: 'clawxpert'
  },
  AssistantBindingService: class AssistantBindingService {},
  XpertService: class XpertService {},
  XpertTypeEnum: { Agent: 'agent' },
  ChatConversationService: class ChatConversationService {},
  Store: class Store {},
  OrderTypeEnum: {
    DESC: 'DESC'
  },
  getErrorMessage: (error: { message?: string } | null | undefined) => error?.message ?? ''
}))

jest.mock('../../assistant/assistant-chatkit.runtime', () => ({
  sanitizeAssistantFrameUrl: (url: string | null | undefined) => url ?? null
}))

jest.mock('../../project/project-api.service', () => ({
  XpertProjectApiService: class XpertProjectApiService {}
}))

import { ActivatedRoute, NavigationEnd, Router } from '@angular/router'
import { TestBed } from '@angular/core/testing'
import { signal } from '@angular/core'
import type { XpertExtensionViewManifest, XpertViewQuery } from '@xpert-ai/contracts'
import { createWorkbenchProjectNavigation } from '../clawxpert/workbench-project-navigation'
import type { ClawXpertWorkspaceTab } from '../clawxpert/conversation-detail/workspace/tabs'
import { BehaviorSubject, Subject, of, throwError } from 'rxjs'
import { TranslateService } from '@ngx-translate/core'
import type { ChatKitControl } from '@xpert-ai/chatkit-angular'
import { TXpertProjectAccessSummary, XpertWorkbenchInitialLayoutEnum } from '@xpert-ai/contracts'
import {
  XpertService,
  AssistantBindingService,
  ChatConversationService,
  IChatConversation,
  Store
} from '../../../@core'
import { XpertProjectApiService } from '../../project/project-api.service'
import { XpertWorkbenchFacade } from './xpert-workbench.facade'
import type { ConversationEntryResolution } from './conversation-entry.resolver'

describe('XpertWorkbenchFacade', () => {
  let routerEvents: Subject<NavigationEnd>
  let router: {
    events: Subject<NavigationEnd>
    navigate: jest.Mock
    parseUrl: jest.Mock
    url: string
  }
  let store: {
    organizationId: string | null
    selectOrganizationId: jest.Mock
    activeScope: { level: 'tenant' } | { level: 'organization'; organizationId: string }
    selectActiveScope: jest.Mock
  }
  let xpertService: { getMyAll: jest.Mock }
  let assistantBindingService: {
    getAvailableXperts: jest.Mock
  }
  let conversationService: {
    findAllByXpert: jest.Mock
    getByThreadId: jest.Mock
  }
  let projectApi: {
    access: jest.Mock
    get: jest.Mock
  }
  let translate: {
    instant: jest.Mock
  }
  let routeData: BehaviorSubject<{ conversationEntry: ConversationEntryResolution }>
  const privateEntry = { entry: null, organizationId: 'org-1', error: null }

  beforeEach(() => {
    routerEvents = new Subject<NavigationEnd>()
    routeData = new BehaviorSubject<{ conversationEntry: ConversationEntryResolution }>({
      conversationEntry: privateEntry
    })
    router = {
      events: routerEvents,
      navigate: jest.fn().mockResolvedValue(true),
      parseUrl: jest.fn((url: string) => ({ queryParams: parseQueryParams(url) })),
      url: '/chat/x/sales/c'
    }
    store = {
      organizationId: 'org-1',
      activeScope: { level: 'organization', organizationId: 'org-1' },
      selectActiveScope: jest.fn(() => of(store.activeScope)),
      selectOrganizationId: jest.fn(() => of('org-1'))
    }
    assistantBindingService = {
      getAvailableXperts: jest.fn(() =>
        of([
          {
            id: 'xpert-1',
            slug: 'sales',
            title: 'Sales Xpert',
            latest: true,
            options: {
              workbench: {
                initialLayout: XpertWorkbenchInitialLayoutEnum.WorkbenchMaximized,
                defaultViewKey: 'provider__metrics'
              }
            }
          }
        ])
      )
    }
    xpertService = {
      getMyAll: jest.fn(() => of({ items: [{ id: 'xpert-1', slug: 'sales', latest: true }], total: 1 }))
    }
    conversationService = {
      getByThreadId: jest.fn(),
      findAllByXpert: jest.fn(() => of({ items: [] as IChatConversation[] }))
    }
    projectApi = {
      get: jest.fn(() => of({ id: 'project-1', name: 'Bid project' })),
      access: jest.fn(() => of(editorAccess()))
    }
    translate = {
      instant: jest.fn((_key: string, params?: { Default?: string }) => params?.Default ?? _key)
    }

    TestBed.resetTestingModule()
    TestBed.configureTestingModule({
      providers: [
        XpertWorkbenchFacade,
        { provide: XpertService, useValue: xpertService },
        { provide: ActivatedRoute, useValue: { data: routeData, snapshot: { data: routeData.value } } },
        {
          provide: Router,
          useValue: router
        },
        {
          provide: Store,
          useValue: store
        },
        {
          provide: AssistantBindingService,
          useValue: assistantBindingService
        },
        {
          provide: ChatConversationService,
          useValue: conversationService
        },
        {
          provide: XpertProjectApiService,
          useValue: projectApi
        },
        {
          provide: TranslateService,
          useValue: translate
        }
      ]
    })
  })

  afterEach(() => {
    TestBed.resetTestingModule()
    jest.clearAllMocks()
  })

  it('loads the accessible xpert for the current slug', async () => {
    const facade = TestBed.inject(XpertWorkbenchFacade)

    await settle()

    expect(assistantBindingService.getAvailableXperts).toHaveBeenCalled()
    expect(xpertService.getMyAll).not.toHaveBeenCalled()
    expect(facade.viewState()).toBe('ready')
    expect(facade.xpertId()).toBe('xpert-1')
    expect(facade.assistantId()).toBe('xpert-1')
    expect(facade.identity()).toBe('chat-xpert-workbench:xpert-1')
    expect(facade.projectId()).toBeNull()
    expect(facade.projectAccess()).toBeNull()
    expect(projectApi.access).not.toHaveBeenCalled()
    expect(facade.initialLayout()).toBe(XpertWorkbenchInitialLayoutEnum.WorkbenchMaximized)
    expect(facade.defaultViewKey()).toBe('provider__metrics')
  })

  it('loads a tenant Assistant in explicit tenant scope without an organization binding', async () => {
    store.organizationId = null
    store.activeScope = { level: 'tenant' }
    store.selectOrganizationId.mockReturnValue(of(null))
    const facade = TestBed.inject(XpertWorkbenchFacade)
    await settle()
    expect(facade.viewState()).toBe('ready')
    expect(facade.assistantId()).toBe('xpert-1')
    expect(xpertService.getMyAll).toHaveBeenCalledWith({
      where: { type: 'agent', latest: true },
      order: { createdAt: 'DESC' }
    })
    expect(projectApi.access).not.toHaveBeenCalled()
    expect(assistantBindingService.getAvailableXperts).not.toHaveBeenCalled()
  })

  it('does not interpret a missing organization as permission to use tenant scope', async () => {
    store.organizationId = null
    store.selectOrganizationId.mockReturnValue(of(null))
    const facade = TestBed.inject(XpertWorkbenchFacade)
    await settle()
    expect(facade.viewState()).toBe('organization-required')
    expect(xpertService.getMyAll).not.toHaveBeenCalled()
  })

  it('keeps unavailable tenant Assistants blocked by the server-accessible list', async () => {
    store.organizationId = null
    store.activeScope = { level: 'tenant' }
    store.selectOrganizationId.mockReturnValue(of(null))
    xpertService.getMyAll.mockReturnValue(of({ items: [], total: 0 }))
    const facade = TestBed.inject(XpertWorkbenchFacade)
    await settle()
    expect(facade.viewState()).toBe('error')
    expect(facade.assistantId()).toBeNull()
  })

  function navigateEntry(entry: ConversationEntryResolution) {
    routeData.next({ conversationEntry: entry })
    routerEvents.next(new NavigationEnd(2, router.url, router.url))
  }

  it('chooses the group adapter from purpose on the normal conversation route without a personal binding', async () => {
    router.url = '/chat/x/assistant-primary/c/group-thread'
    navigateEntry({
      entry: { id: 'group-1', threadId: 'group-thread', xpertId: 'assistant-primary', title: 'Team', purpose: 'group' },
      organizationId: 'org-1',
      error: null
    })
    const facade = TestBed.inject(XpertWorkbenchFacade)
    await settle()
    expect(facade.viewState()).toBe('ready')
    expect(facade.group()).toEqual({ id: 'group-1' })
    expect(facade.assistantId()).toBe('assistant-primary')
    expect(facade.identity()).toBe('chat-group:group-1')
    expect(facade.assistantTitle()).toBe('Team')
    expect(facade.threadId()).toBeNull()
    expect(assistantBindingService.getAvailableXperts).not.toHaveBeenCalled()
    facade.onChatThreadChange('runtime-thread')
    await facade.syncConversationProject('runtime-thread')
    expect(router.navigate).not.toHaveBeenCalled()
    expect(conversationService.getByThreadId).not.toHaveBeenCalled()
  })

  it('does not mount a group whose entry belongs to another organization', async () => {
    router.url = '/chat/x/primary/c/group-thread'
    navigateEntry({
      entry: { id: 'group-1', threadId: 'group-thread', xpertId: 'primary', title: 'Team', purpose: 'group' },
      organizationId: 'other-org',
      error: null
    })
    const facade = TestBed.inject(XpertWorkbenchFacade)
    await settle()
    expect(facade.viewState()).toBe('error')
  })

  it('shows entry access errors instead of mounting a private chat', async () => {
    router.url = '/chat/x/sales/c/group-thread'
    navigateEntry({ entry: null, organizationId: 'org-1', error: 'Access denied' })
    const facade = TestBed.inject(XpertWorkbenchFacade)
    await settle()
    expect(facade.viewState()).toBe('error')
    expect(facade.viewErrorMessage()).toBe('Access denied')
  })

  it('restores the ordinary adapter when leaving a group on the same route component', async () => {
    router.url = '/chat/x/sales/c/group-thread'
    navigateEntry({
      entry: { id: 'group-1', threadId: 'group-thread', xpertId: 'xpert-1', title: 'Team', purpose: 'group' },
      organizationId: 'org-1',
      error: null
    })
    const facade = TestBed.inject(XpertWorkbenchFacade)
    await settle()
    router.url = '/chat/x/sales/c'
    navigateEntry(privateEntry)
    await settle()
    expect(facade.group()).toBeNull()
    expect(facade.identity()).toBe('chat-xpert-workbench:xpert-1')
    expect(facade.viewState()).toBe('ready')
  })

  it('shows an error when the slug is not accessible', async () => {
    assistantBindingService.getAvailableXperts.mockReturnValue(of([{ id: 'xpert-2', slug: 'ops', latest: true }]))

    const facade = TestBed.inject(XpertWorkbenchFacade)

    await settle()

    expect(facade.viewState()).toBe('error')
    expect(facade.xpertId()).toBeNull()
    expect(facade.viewErrorMessage()).toContain('unavailable')
  })

  it('starts a blank chat at the Assistant entry even when previous conversations exist', async () => {
    conversationService.findAllByXpert.mockReturnValue(
      of({
        items: [
          {
            id: 'conversation-1',
            threadId: 'thread-1'
          } as IChatConversation
        ]
      })
    )
    const facade = TestBed.inject(XpertWorkbenchFacade)
    const control = createMockChatKitControl()

    await settle()
    await facade.ensureConversationEntry(control)

    expect(conversationService.findAllByXpert).not.toHaveBeenCalled()
    expect(router.navigate).not.toHaveBeenCalled()
    expect(control.setThreadId).toHaveBeenCalledWith(null)
    expect(control.focusComposer).toHaveBeenCalled()
  })

  it('focuses the composer on a blank entry', async () => {
    const facade = TestBed.inject(XpertWorkbenchFacade)
    const control = createMockChatKitControl()

    await settle()
    await facade.ensureConversationEntry(control)

    expect(router.navigate).not.toHaveBeenCalled()
    expect(control.focusComposer).toHaveBeenCalled()
  })

  it('syncs ChatKit thread changes into the xpert workbench route', async () => {
    const facade = TestBed.inject(XpertWorkbenchFacade)

    await settle()
    facade.onChatThreadChange('thread-2')

    expect(router.navigate).toHaveBeenCalledWith(['/chat/x', 'sales', 'c', 'thread-2'], {
      queryParamsHandling: 'preserve'
    })

    setRoute('/chat/x/sales/c/thread-2')
    facade.onChatThreadChange(null)

    expect(facade.suppressAutoResume()).toBe(true)
    expect(router.navigate).toHaveBeenLastCalledWith(['/chat/x', 'sales', 'c'], {
      queryParamsHandling: 'preserve'
    })
  })

  it.each([
    ['project-required', 'auto-new'],
    ['project-preferred', 'none']
  ] as const)('defaults %s to %s without looking up a previous Project', async (scope, selection) => {
    assistantBindingService.getAvailableXperts.mockReturnValue(
      of([
        {
          id: 'xpert-1',
          slug: 'sales',
          latest: true,
          options: { workspaceScope: { mode: scope, onMissing: 'create' } }
        }
      ])
    )
    const facade = TestBed.inject(XpertWorkbenchFacade)
    await settle()
    await facade.ensureConversationEntry(createMockChatKitControl())
    expect(facade.chatkitProjectSelection()).toEqual({ mode: selection })
    expect(facade.chatkitMountProjectId()).toBeNull()
    expect(conversationService.findAllByXpert).not.toHaveBeenCalled()
  })

  it.each(['none', 'auto-new'] as const)('clears old Project and view scope for explicit %s', async (mode) => {
    setRoute('/chat/x/sales/p/old-project/c?view=studio&viewSelection=old-case&viewParameters=old-context')
    const facade = TestBed.inject(XpertWorkbenchFacade)
    await settle()
    await facade.onChatProjectChange(null, undefined, { mode })
    expect(router.navigate).toHaveBeenLastCalledWith(['/chat/x', 'sales', 'c'], {
      queryParamsHandling: 'merge',
      queryParams: { projectMode: mode, viewProject: null, viewSelection: null, viewParameters: null }
    })
    setRoute(`/chat/x/sales/c?view=studio&projectMode=${mode}`)
    await settle()
    expect(facade.chatkitProjectSelection()).toEqual({ mode })
    expect(facade.chatkitMountProjectId()).toBeNull()
    await facade.ensureConversationEntry(createMockChatKitControl())
    expect(conversationService.findAllByXpert).not.toHaveBeenCalled()
  })

  it('adopts a persisted first-send Project without changing the mounted ChatKit identity', async () => {
    router.url = '/chat/x/sales/c/thread-1'
    const facade = TestBed.inject(XpertWorkbenchFacade)
    await settle()
    const identity = facade.identity()
    conversationService.getByThreadId.mockReturnValue(
      of({ id: 'conversation-1', threadId: 'thread-1', projectId: 'project-1' })
    )
    await facade.syncConversationProject('thread-1')
    expect(router.navigate).toHaveBeenCalledWith(['/chat/x', 'sales', 'p', 'project-1', 'c', 'thread-1'], {
      queryParamsHandling: 'preserve',
      replaceUrl: true
    })
    setRoute('/chat/x/sales/p/project-1/c/thread-1')
    expect(facade.projectId()).toBe('project-1')
    expect(facade.chatkitMountProjectId()).toBeNull()
    expect(facade.identity()).toBe(identity)
    expect(facade.suppressAutoResume()).toBe(false)
    setRoute('/chat/x/sales/p/project-1/c/thread-2')
    expect(facade.chatkitMountProjectId()).toBe('project-1')
    expect(facade.identity()).toBe(identity)
  })

  it('keeps the first-send ChatKit mount and active conversation when opening its project receipt', async () => {
    router.url = '/chat/x/sales/c/thread-1'
    const facade = TestBed.inject(XpertWorkbenchFacade)
    await settle()
    const identity = facade.identity()
    const conversation = { id: 'conversation-1', threadId: 'thread-1', projectId: 'project-1' } as IChatConversation
    conversationService.getByThreadId.mockReturnValue(of(conversation))
    await facade.syncConversationProject('thread-1')
    setRoute('/chat/x/sales/p/project-1/c/thread-1')
    facade.setActiveConversation(conversation)
    const activeConversation = facade.activeConversation()
    const selectProject = jest.spyOn(facade, 'onChatProjectChange')
    const manifest: XpertExtensionViewManifest = {
      key: 'platform.project-tasks__timeline',
      title: 'Tasks',
      hostType: 'agent',
      slot: 'agent.workbench',
      source: { provider: 'platform.project-tasks' },
      view: { type: 'table' },
      dataSource: { mode: 'platform' }
    }
    const tabs = signal<ClawXpertWorkspaceTab[]>([])
    const navigation = TestBed.runInInjectionContext(() =>
      createWorkbenchProjectNavigation({
        hostId: facade.assistantId,
        routeKey: () => `${facade.assistantId()}:${facade.threadId()}`,
        language: () => 'en',
        views: { getSlotViews: () => of([manifest]) },
        tabs,
        activate: () => setRoute(`/chat/x/sales/p/project-1/c/thread-1?view=${manifest.key}&viewProject=project-1`),
        selectProject: (id) => facade.onChatProjectChange(id),
        url: { viewKey: signal(null), viewQuery: signal<XpertViewQuery | null>(null), projectId: signal(null) },
        onError: (error) => {
          throw error
        }
      })
    )
    await navigation.open({ projectId: 'project-1', view: { viewKey: manifest.key } })
    await settle()
    expect(selectProject).not.toHaveBeenCalled()
    expect(facade.activeConversation()).toBe(activeConversation)
    expect(facade.threadId()).toBe('thread-1')
    expect(facade.chatkitMountProjectId()).toBeNull()
    expect(facade.identity()).toBe(identity)
    expect(facade.suppressAutoResume()).toBe(false)
    expect(tabs()[0]).toMatchObject({ projectScope: { projectId: 'project-1' } })
  })

  it('shares the pending navigation when move confirmation and history refresh the same thread', async () => {
    router.url = '/chat/x/sales/c/thread-1'
    const facade = TestBed.inject(XpertWorkbenchFacade)
    await settle()
    const conversation = { id: 'conversation-1', threadId: 'thread-1', projectId: 'project-1', xpertId: 'xpert-1' }
    conversationService.getByThreadId.mockReturnValue(of(conversation))
    let finishNavigation!: (opened: boolean) => void
    router.navigate.mockReturnValue(new Promise<boolean>((resolve) => (finishNavigation = resolve)))
    const completed = jest.fn()
    const confirmation = facade.syncConversationProject('thread-1').then(completed)
    const historyRefresh = facade.syncConversationProject('thread-1', conversation).then(completed)
    await settle()
    expect(router.navigate).toHaveBeenCalledTimes(1)
    expect(conversationService.getByThreadId).toHaveBeenCalledTimes(1)
    expect(completed).not.toHaveBeenCalled()
    setRoute('/chat/x/sales/p/project-1/c/thread-1')
    finishNavigation(true)
    await Promise.all([confirmation, historyRefresh])
    expect(completed).toHaveBeenCalledTimes(2)
    expect(facade.threadId()).toBe('thread-1')
    expect(facade.chatkitMountProjectId()).toBeNull()
    expect(facade.chatkitProjectSelection()).toEqual({ mode: 'none' })
  })

  it('keeps the newer adoption when an older project navigation is cancelled', async () => {
    router.url = '/chat/x/sales/c/thread-1'
    const facade = TestBed.inject(XpertWorkbenchFacade)
    await settle()
    let cancelFirst!: (opened: boolean) => void
    router.navigate.mockReturnValueOnce(new Promise<boolean>((resolve) => (cancelFirst = resolve)))
    const conversation = { id: 'conversation-1', threadId: 'thread-1', xpertId: 'xpert-1' }
    const first = facade.syncConversationProject('thread-1', { ...conversation, projectId: 'project-1' })
    const second = facade.syncConversationProject('thread-1', { ...conversation, projectId: 'project-2' })
    setRoute('/chat/x/sales/p/project-2/c/thread-1')
    cancelFirst(false)
    await Promise.all([first, second])
    expect(router.navigate).toHaveBeenCalledTimes(2)
    expect(facade.chatkitMountProjectId()).toBeNull()
    expect(facade.chatkitProjectSelection()).toEqual({ mode: 'none' })
  })

  it('ignores late project lookups after the user switches conversations', async () => {
    router.url = '/chat/x/sales/c/thread-1'
    const facade = TestBed.inject(XpertWorkbenchFacade)
    await settle()
    const lookup = new Subject<IChatConversation>()
    conversationService.getByThreadId.mockReturnValue(lookup)
    const pending = facade.syncConversationProject('thread-1')
    setRoute('/chat/x/sales/c/thread-2')
    lookup.next({ id: 'conversation-1', threadId: 'thread-1', projectId: 'project-1' } as IChatConversation)
    await pending
    expect(router.navigate).not.toHaveBeenCalled()
    expect(facade.chatkitMountProjectId()).toBeNull()
  })

  it.each(['project-b', null])('adopts historical scope %s without remounting ChatKit', async (projectId) => {
    router.url = '/chat/x/sales/p/project-a/c/thread-b?view=studio&viewSelection=old-case'
    const facade = TestBed.inject(XpertWorkbenchFacade)
    await settle()
    const identity = facade.identity()
    conversationService.getByThreadId.mockReturnValue(of({ id: 'conversation-b', threadId: 'thread-b', projectId }))
    await facade.syncConversationProject('thread-b')
    const route = projectId
      ? ['/chat/x', 'sales', 'p', projectId, 'c', 'thread-b']
      : ['/chat/x', 'sales', 'c', 'thread-b']
    expect(router.navigate).toHaveBeenLastCalledWith(route, {
      queryParamsHandling: 'merge',
      queryParams: { projectMode: null, viewSelection: null, viewParameters: null },
      replaceUrl: true
    })
    setRoute(projectId ? `/chat/x/sales/p/${projectId}/c/thread-b` : '/chat/x/sales/c/thread-b')
    await settle()
    expect(facade.projectId()).toBe(projectId)
    expect(facade.chatkitMountProjectId()).toBe('project-a')
    expect(facade.chatkitProjectSelection()).toEqual({ mode: 'existing', projectId: 'project-a' })
    expect(facade.identity()).toBe(identity)
  })

  it('syncs ChatKit Project changes into the workbench route and starts a blank scoped chat', async () => {
    const viewState = '?view=sales-orders&viewSelection=order-1&viewParameters=%7B%22tab%22%3A%22open%22%7D'
    setRoute(`/chat/x/sales/p/old-project/c/thread-1${viewState}&viewProject=old-project`)
    const facade = TestBed.inject(XpertWorkbenchFacade)

    await settle()
    facade.setActiveConversation({ id: 'conversation-1' } as IChatConversation)
    facade.projectAccess.set(editorAccess())
    facade.onChatProjectChange(' project-1 ')

    expect(facade.suppressAutoResume()).toBe(true)
    expect(facade.activeConversation()).toBeNull()
    expect(facade.projectAccess()).toBeNull()
    expect(router.navigate).toHaveBeenCalledWith(['/chat/x', 'sales', 'p', 'project-1', 'c'], {
      queryParamsHandling: 'merge',
      queryParams: { projectMode: null, viewProject: null, viewSelection: null, viewParameters: null }
    })

    setRoute(`/chat/x/sales/p/project-1/c${viewState}`)
    facade.onChatProjectChange(null)

    expect(router.navigate).toHaveBeenLastCalledWith(['/chat/x', 'sales', 'c'], {
      queryParamsHandling: 'merge',
      queryParams: { projectMode: null, viewProject: null, viewSelection: null, viewParameters: null }
    })
  })

  it('changes Project and business selection in one route without moving the old conversation', async () => {
    const facade = TestBed.inject(XpertWorkbenchFacade)
    await settle()
    const view = { viewKey: 'provider__studio', selectionId: 'case-b', parameters: { tab: 'features' } }
    await facade.onChatProjectChange('project-b', view)
    expect(router.navigate).toHaveBeenCalledTimes(1)
    expect(router.navigate).toHaveBeenCalledWith(['/chat/x', 'sales', 'p', 'project-b', 'c'], {
      queryParamsHandling: 'merge',
      queryParams: {
        view: 'provider__studio',
        projectMode: null,
        viewProject: null,
        viewSelection: 'case-b',
        viewParameters: JSON.stringify({ tab: 'features' })
      }
    })
    expect(facade.activeConversation()).toBeNull()
    expect(facade.suppressAutoResume()).toBe(true)
    setRoute('/chat/x/sales/p/project-b/c')
    await facade.onChatProjectChange('project-b', { viewKey: 'provider__studio' })
    expect(router.navigate).toHaveBeenLastCalledWith(['/chat/x', 'sales', 'p', 'project-b', 'c'], {
      queryParamsHandling: 'merge',
      queryParams: {
        view: 'provider__studio',
        projectMode: null,
        viewProject: null,
        viewSelection: null,
        viewParameters: null
      }
    })
  })

  it('preserves access when opening a Case in the same Project and restores state on cancelled navigation', async () => {
    setRoute('/chat/x/sales/p/project-1/c')
    const facade = TestBed.inject(XpertWorkbenchFacade)
    await settle()
    facade.projectAccess.set(editorAccess())
    await facade.onChatProjectChange('project-1', { viewKey: 'studio', selectionId: 'case-1' })
    expect(facade.projectAccess()).toEqual(editorAccess())
    facade.suppressAutoResume.set(false)
    router.navigate.mockResolvedValueOnce(false)
    expect(await facade.onChatProjectChange('project-2')).toBe(false)
    expect(facade.projectAccess()).toEqual(editorAccess())
    expect(facade.suppressAutoResume()).toBe(false)
  })

  it('keeps the Project scope in a blank project-local conversation', async () => {
    router.url = '/chat/x/sales/p/project-1/c'
    conversationService.findAllByXpert.mockReturnValue(
      of({ items: [{ id: 'conversation-1', threadId: 'thread-1' } as IChatConversation] })
    )
    const facade = TestBed.inject(XpertWorkbenchFacade)

    await settle()
    await facade.ensureConversationEntry(createMockChatKitControl())

    expect(facade.projectId()).toBe('project-1')
    expect(projectApi.access).toHaveBeenCalledWith('project-1')
    expect(facade.projectAccess()).toEqual(editorAccess())
    expect(facade.identity()).toBe('chat-xpert-workbench:xpert-1')
    expect(conversationService.findAllByXpert).not.toHaveBeenCalled()
    expect(router.navigate).not.toHaveBeenCalled()
    expect(facade.chatkitProjectSelection()).toEqual({ mode: 'existing', projectId: 'project-1' })
  })

  it.each([
    ['member', memberAccess()],
    ['editor', editorAccess()]
  ])('loads %s access for the current Project route', async (_role, access) => {
    router.url = '/chat/x/sales/p/project-1/c'
    projectApi.access.mockReturnValue(of(access))
    const facade = TestBed.inject(XpertWorkbenchFacade)

    await settle()

    expect(projectApi.access).toHaveBeenCalledWith('project-1')
    expect(facade.projectAccess()).toEqual(access)
  })

  it('ignores a slow Project access response after the route switches to another Project', async () => {
    const project1Access$ = new Subject<TXpertProjectAccessSummary>()
    const project2Access$ = new Subject<TXpertProjectAccessSummary>()
    projectApi.access.mockImplementation((projectId: string) =>
      projectId === 'project-1' ? project1Access$ : project2Access$
    )
    router.url = '/chat/x/sales/p/project-1/c'
    const facade = TestBed.inject(XpertWorkbenchFacade)
    await settle()

    setRoute('/chat/x/sales/p/project-2/c')
    expect(facade.projectAccess()).toBeNull()
    await settle()

    project2Access$.next(editorAccess())
    await settle()
    expect(facade.projectAccess()).toEqual(editorAccess())

    project1Access$.next(memberAccess())
    await settle()
    expect(facade.projectAccess()).toEqual(editorAccess())
  })

  it('fails closed while Project access is pending or denied', async () => {
    router.url = '/chat/x/sales/p/project-1/c'
    projectApi.access.mockReturnValue(of(editorAccess()))
    const facade = TestBed.inject(XpertWorkbenchFacade)
    await settle()
    expect(facade.projectAccess()).toEqual(editorAccess())

    projectApi.access.mockReturnValue(throwError(() => ({ status: 403 })))
    setRoute('/chat/x/sales/p/project-2/c')

    await settle()
    expect(projectApi.access).toHaveBeenLastCalledWith('project-2')
    expect(facade.projectAccess()).toBeNull()
  })

  it('does not leave the Project route when ChatKit clears the active thread', async () => {
    router.url = '/chat/x/sales/p/project-1/c/thread-1'
    const facade = TestBed.inject(XpertWorkbenchFacade)

    await settle()
    facade.onChatThreadChange(null)

    expect(router.navigate).toHaveBeenCalledWith(['/chat/x', 'sales', 'p', 'project-1', 'c'], {
      queryParamsHandling: 'preserve'
    })
  })

  it('preserves the selected assistant view without resuming a previous thread', async () => {
    conversationService.findAllByXpert.mockReturnValue(
      of({ items: [{ id: 'conversation-1', threadId: 'thread-1' } as IChatConversation] })
    )
    router.url = '/chat/x/sales/c?view=sales-orders'
    const facade = TestBed.inject(XpertWorkbenchFacade)

    await settle()
    await facade.ensureConversationEntry(createMockChatKitControl())

    expect(conversationService.findAllByXpert).not.toHaveBeenCalled()
    expect(router.navigate).not.toHaveBeenCalled()
    expect(router.url).toBe('/chat/x/sales/c?view=sales-orders')
  })

  it('preserves complete workbench view state across consecutive thread switches', async () => {
    const viewState = '?view=bid.studio&viewSelection=project-1&viewParameters=%7B%22view%22%3A%22workflow%22%7D'
    router.url = `/chat/x/sales/c/thread-1${viewState}`
    const facade = TestBed.inject(XpertWorkbenchFacade)

    await settle()
    facade.onChatThreadChange('thread-2')

    expect(router.navigate).toHaveBeenLastCalledWith(['/chat/x', 'sales', 'c', 'thread-2'], {
      queryParamsHandling: 'preserve'
    })

    setRoute(`/chat/x/sales/c/thread-2${viewState}`)
    facade.onChatThreadChange('thread-3')

    expect(router.navigate).toHaveBeenLastCalledWith(['/chat/x', 'sales', 'c', 'thread-3'], {
      queryParamsHandling: 'preserve'
    })
  })

  it('preserves a locally created thread while Project route navigation is pending, then allows a new chat', async () => {
    const facade = TestBed.inject(XpertWorkbenchFacade)
    const control = createMockChatKitControl()
    await settle()
    await facade.ensureConversationEntry(control)

    // Project selection first wakes the entry effect on the old blank route.
    await facade.onChatProjectChange('project-1')
    await facade.ensureConversationEntry(control)
    setRoute('/chat/x/sales/p/project-1/c')
    await settle()
    control.setThreadId.mockClear()
    control.focusComposer.mockClear()

    let resolveNavigation!: (opened: boolean) => void
    router.navigate.mockImplementationOnce(() => new Promise<boolean>((resolve) => (resolveNavigation = resolve)))
    facade.onChatThreadChange('thread-created')
    expect(facade.threadId()).toBeNull()
    expect(facade.suppressAutoResume()).toBe(false)
    // The detail component schedules this when suppressAutoResume changes.
    await facade.ensureConversationEntry(control)
    await facade.ensureConversationEntry(control)
    expect(control.setThreadId).not.toHaveBeenCalled()
    expect(control.focusComposer).not.toHaveBeenCalled()

    setRoute('/chat/x/sales/p/project-1/c/thread-created')
    resolveNavigation(true)
    await settle()
    facade.onChatThreadChange(null)
    setRoute('/chat/x/sales/p/project-1/c')
    await settle()
    await facade.ensureConversationEntry(control)
    expect(control.setThreadId).toHaveBeenCalledTimes(1)
    expect(control.setThreadId).toHaveBeenCalledWith(null)
  })

  it.each(['none', 'auto-new'] as const)(
    'consumes the %s entry before waking automatic initialization',
    async (mode) => {
      setRoute(`/chat/x/sales/c?projectMode=${mode}`)
      const facade = TestBed.inject(XpertWorkbenchFacade)
      const control = createMockChatKitControl()
      await settle()
      facade.suppressAutoResume.set(true)
      const setSuppression = facade.suppressAutoResume.set.bind(facade.suppressAutoResume)
      jest.spyOn(facade.suppressAutoResume, 'set').mockImplementation((value) => {
        setSuppression(value)
        void facade.ensureConversationEntry(control)
      })

      facade.onChatThreadChange('thread-created')

      expect(control.setThreadId).not.toHaveBeenCalled()
      expect(router.navigate).toHaveBeenCalledWith(['/chat/x', 'sales', 'c', 'thread-created'], {
        queryParamsHandling: 'preserve'
      })
    }
  )

  it('preserves the live thread when its route navigation is cancelled', async () => {
    setRoute('/chat/x/sales/p/project-1/c')
    const facade = TestBed.inject(XpertWorkbenchFacade)
    const control = createMockChatKitControl()
    await settle()
    router.navigate.mockResolvedValueOnce(false)

    facade.onChatThreadChange('thread-created')
    await settle()
    await facade.ensureConversationEntry(control)
    expect(control.setThreadId).not.toHaveBeenCalled()

    // A later successful synchronization and explicit new chat must still work.
    facade.onChatThreadChange('thread-created')
    setRoute('/chat/x/sales/p/project-1/c/thread-created')
    await settle()
    facade.onChatThreadChange(null)
    setRoute('/chat/x/sales/p/project-1/c')
    await settle()
    await facade.ensureConversationEntry(control)
    expect(control.setThreadId).toHaveBeenCalledTimes(1)
  })

  it('initializes a different Project or Assistant after consuming a locally created thread entry', async () => {
    assistantBindingService.getAvailableXperts.mockReturnValue(
      of([
        { id: 'xpert-1', slug: 'sales', latest: true },
        { id: 'xpert-2', slug: 'ops', latest: true }
      ])
    )
    setRoute('/chat/x/sales/p/project-1/c')
    const facade = TestBed.inject(XpertWorkbenchFacade)
    const control = createMockChatKitControl()
    await settle()
    facade.onChatThreadChange('thread-created')

    setRoute('/chat/x/sales/p/project-2/c')
    await settle()
    await facade.ensureConversationEntry(control)
    expect(control.setThreadId).toHaveBeenCalledTimes(1)

    setRoute('/chat/x/ops/p/project-2/c')
    await settle()
    await facade.ensureConversationEntry(control)
    expect(control.setThreadId).toHaveBeenCalledTimes(2)

    setRoute('/chat/x/ops/p/project-2/c/historical-thread')
    await settle()
    facade.onChatThreadChange('historical-thread')
    await facade.ensureConversationEntry(control)
    expect(control.setThreadId).toHaveBeenCalledTimes(2)
  })

  it('does not let a late cancelled Project switch restore the previous conversation after first send', async () => {
    setRoute('/chat/x/sales/p/project-1/c')
    const facade = TestBed.inject(XpertWorkbenchFacade)
    const control = createMockChatKitControl()
    await settle()
    let resolveNavigation!: (opened: boolean) => void
    router.navigate.mockImplementationOnce(() => new Promise<boolean>((resolve) => (resolveNavigation = resolve)))
    const pendingSwitch = facade.onChatProjectChange('project-2')
    await facade.onChatProjectChange('project-3')
    setRoute('/chat/x/sales/p/project-3/c')
    await settle()
    facade.onChatThreadChange('thread-created')
    resolveNavigation(false)
    await pendingSwitch
    await facade.ensureConversationEntry(control)

    expect(facade.suppressAutoResume()).toBe(false)
    expect(facade.projectId()).toBe('project-3')
    expect(control.setThreadId).not.toHaveBeenCalled()
  })

  function setRoute(url: string) {
    router.url = url
    routerEvents.next(new NavigationEnd(Date.now(), url, url))
  }

  function createMockChatKitControl() {
    return {
      element: null,
      setOptions: jest.fn(),
      focusComposer: jest.fn().mockResolvedValue(undefined),
      setThreadId: jest.fn().mockResolvedValue(undefined),
      sendUserMessage: jest.fn().mockResolvedValue(undefined),
      setComposerValue: jest.fn().mockResolvedValue(undefined),
      fetchUpdates: jest.fn().mockResolvedValue(undefined),
      sendCustomAction: jest.fn().mockResolvedValue(undefined)
    } satisfies ChatKitControl
  }

  function parseQueryParams(url: string) {
    const query = url.split('?')[1] ?? ''
    return Object.fromEntries(
      query
        .split('&')
        .filter(Boolean)
        .map((entry) => entry.split('=').map((part) => decodeURIComponent(part)))
    )
  }
})

function settle() {
  return new Promise((resolve) => setTimeout(resolve))
}

function editorAccess(): TXpertProjectAccessSummary {
  return {
    role: 'editor',
    capabilities: { canRead: true, canEdit: true, canManage: false, canUse: true }
  }
}

function memberAccess(): TXpertProjectAccessSummary {
  return {
    role: 'member',
    capabilities: { canRead: true, canEdit: false, canManage: false, canUse: true }
  }
}
