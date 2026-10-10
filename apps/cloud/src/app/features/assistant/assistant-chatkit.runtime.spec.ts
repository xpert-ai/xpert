import { DOCUMENT } from '@angular/common'
import { HttpClient } from '@angular/common/http'
import { signal } from '@angular/core'
import { TestBed } from '@angular/core/testing'
import { environment } from '@cloud/environments/environment'
import { TranslateService } from '@ngx-translate/core'
import { createChatKit, type CreateChatKitOptions } from '@xpert-ai/chatkit-angular'
import { ZardDialogService } from '@xpert-ai/headless-ui'
import { BehaviorSubject, of, throwError } from 'rxjs'
import { AppService } from '../../app.service'
import { ArtifactService } from '../../@core/services/artifact.service'
import { XpertPublicationService } from '../../@core/services/xpert-publication.service'
import {
  AssistantBindingScope,
  AssistantBindingSourceScope,
  AssistantCode,
  Store,
  ToastrService,
  type IResolvedAssistantBinding
} from '../../@core'
import {
  hasAssistantBindingSource,
  hasCompleteAssistantBinding,
  injectHostedAssistantChatkitControl,
  resolveAssistantMcpAppsOptions,
  CHATKIT_ATTACHMENT_MAX_BYTES
} from './assistant-chatkit.runtime'

jest.mock('../../app.service', () => ({
  AppService: class AppService {}
}))

jest.mock('../../@core/state/store.service', () => ({
  Store: class Store {}
}))

jest.mock('../../@core', () => ({
  AssistantBindingService: class AssistantBindingService {},
  AssistantBindingScope: {
    ORGANIZATION: 'organization'
  },
  AssistantBindingSourceScope: {
    NONE: 'none',
    ORGANIZATION: 'organization'
  },
  AssistantCode: {
    CHATBI: 'chatbi'
  },
  Store: jest.requireMock('../../@core/state/store.service').Store,
  ToastrService: class ToastrService {},
  getErrorMessage: jest.fn((error?: { message?: string }) => error?.message ?? ''),
  resolveAbsoluteApiBaseUrl: jest.fn((value?: string | null) => {
    const normalized = value?.trim()
    if (!normalized || ['same-origin', 'self', '/'].includes(normalized.toLowerCase())) {
      return window.location.origin
    }
    if (normalized.startsWith('//')) {
      return `${window.location.protocol}${normalized.replace(/\/+$/, '')}`
    }
    return normalized.replace(/\/+$/, '')
  })
}))

jest.mock('@xpert-ai/chatkit-angular', () => ({
  createChatKit: jest.fn()
}))

function createResolvedBinding(overrides: Partial<IResolvedAssistantBinding> = {}): IResolvedAssistantBinding {
  return {
    id: 'binding-1',
    code: AssistantCode.CHATBI,
    scope: AssistantBindingScope.ORGANIZATION,
    assistantId: 'assistant-1',
    enabled: true,
    tenantId: 'tenant-1',
    organizationId: 'org-1',
    userId: null,
    sourceScope: AssistantBindingSourceScope.ORGANIZATION,
    ...overrides
  }
}

function flushAngularEffects() {
  const testBed = TestBed as unknown as {
    tick?: () => void
    flushEffects?: () => void
  }

  testBed.tick?.()
  testBed.flushEffects?.()
}

describe('assistant chatkit runtime helpers', () => {
  const originalApiBaseUrl = environment.API_BASE_URL

  beforeEach(() => {
    jest.clearAllMocks()
    environment.API_BASE_URL = originalApiBaseUrl
    TestBed.configureTestingModule({
      providers: [{ provide: ZardDialogService, useValue: { open: jest.fn() } }]
    })
  })

  it('normalizes host-owned MCP App sandbox configuration', () => {
    expect(
      resolveAssistantMcpAppsOptions(
        ' https://sandbox.example.com/mcp-app-sandbox-proxy.html ',
        ' *.apps.example.com, app.example.com,*.apps.example.com '
      )
    ).toEqual({
      sandboxProxyUrl: 'https://sandbox.example.com/mcp-app-sandbox-proxy.html',
      allowedDomains: ['*.apps.example.com', 'app.example.com']
    })
    expect(resolveAssistantMcpAppsOptions('DOCKER_MCP_APP_SANDBOX_PROXY_URL', '')).toBeNull()
  })

  afterEach(() => {
    TestBed.resetTestingModule()
  })

  it('treats non-none source bindings as available', () => {
    expect(hasAssistantBindingSource(createResolvedBinding())).toBe(true)
    expect(hasAssistantBindingSource(createResolvedBinding({ sourceScope: AssistantBindingSourceScope.NONE }))).toBe(
      false
    )
    expect(hasAssistantBindingSource(null)).toBe(false)
  })

  it('uses the resolved binding assistantId with the hosted frame url', () => {
    expect(hasCompleteAssistantBinding(createResolvedBinding(), 'https://chatkit.example.com')).toBe(true)
    expect(
      hasCompleteAssistantBinding(createResolvedBinding({ assistantId: null }), 'https://chatkit.example.com')
    ).toBe(false)
    expect(hasCompleteAssistantBinding(createResolvedBinding(), null)).toBe(false)
  })

  it('passes ChatKit pet options when creating and updating hosted controls', () => {
    const setOptions = jest.fn()
    const createChatKitMock = createChatKit as jest.Mock
    createChatKitMock.mockReturnValue({
      setOptions
    })
    const requestContext = signal<Record<string, unknown> | null>({
      env: {
        workspaceId: 'workspace-1'
      }
    })
    const pet = {
      behavior: 'auto' as const,
      position: {
        pin: 'bottom-right' as const,
        draggable: true,
        persist: true,
        boundsPadding: 16,
        zIndex: 70
      }
    }
    const layout = {
      maxWidth: '960px'
    }
    const messagePresentation = { collapseProcess: true }
    const workbench = {
      enabled: true,
      sideChat: {
        enabled: true
      }
    }
    const displayMode = signal<CreateChatKitOptions['displayMode']>('pet')
    const rightHeaderAction = jest.fn()
    const header = signal<CreateChatKitOptions['header']>({
      rightAction: {
        icon: 'sidebar-right',
        onClick: rightHeaderAction
      }
    })
    const onProjectChange = jest.fn()
    const assistantId = signal<string | null>('assistant-1')
    const identity = signal<string | null>('xpert_shared')
    const loading = signal(false)
    const initialThread = signal<string | null>('thread-1')
    const projectId = signal<string | null>('project-1')
    const organizationId = new BehaviorSubject('org-1')
    const composer = signal({
      projects: { enabled: false },
      connectors: { enabled: true }
    })

    TestBed.configureTestingModule({
      providers: [
        {
          provide: DOCUMENT,
          useValue: document
        },
        {
          provide: TranslateService,
          useValue: {
            currentLang: 'en',
            instant: (_key: string, params?: { Default?: string }) => params?.Default ?? _key
          }
        },
        {
          provide: ToastrService,
          useValue: {
            error: jest.fn()
          }
        },
        {
          provide: AppService,
          useValue: {
            lang: signal('en'),
            theme$: signal({ primary: 'light' })
          }
        },
        {
          provide: Store,
          useValue: {
            token: 'token-1',
            token$: of('token-1'),
            organizationId: 'org-1',
            hasPermission: jest.fn(() => false),
            selectOrganizationId: () => organizationId
          }
        }
      ]
    })

    const control = TestBed.runInInjectionContext(() => {
      return injectHostedAssistantChatkitControl({
        identity,
        assistantId,
        loading,
        initialThread,
        projectId,
        frameUrl: signal('/chatkit'),
        requestContext,
        displayMode,
        header,
        layout,
        pet,
        workbench,
        messagePresentation,
        composer,
        onProjectChange,
        titleKey: 'XP.Xpert.Assistant',
        titleDefault: 'Assistant'
      })
    })
    flushAngularEffects()

    expect(createChatKitMock).toHaveBeenCalledWith(
      expect.objectContaining({
        displayMode: 'pet',
        header: expect.objectContaining({
          rightAction: {
            icon: 'sidebar-right',
            onClick: rightHeaderAction
          }
        }),
        layout,
        pet,
        workbench,
        messagePresentation,
        api: expect.objectContaining({
          xpertId: 'assistant-1',
          projectId: 'project-1'
        }),
        messageNavigation: {
          enabled: true
        },
        onProjectChange: expect.any(Function),
        composer: expect.objectContaining({
          projects: { enabled: false },
          connectors: { enabled: true },
          attachments: expect.objectContaining({ enabled: true, maxSize: CHATKIT_ATTACHMENT_MAX_BYTES }),
          tools: []
        }),
        request: {
          context: {
            env: {
              workspaceId: 'workspace-1'
            }
          }
        }
      })
    )
    const firstOptions: CreateChatKitOptions = createChatKitMock.mock.calls[0][0]
    firstOptions.onProjectChange?.({ projectId: 'project-1' })
    expect(onProjectChange).toHaveBeenCalledWith({ projectId: 'project-1' })
    onProjectChange.mockClear()

    const publications = TestBed.inject(XpertPublicationService)
    const createdBeforePublish = createChatKitMock.mock.calls.length
    setOptions.mockClear()
    publications.changes$.next({ organizationId: 'other-org', assistantId: 'assistant-1' })
    publications.changes$.next({ organizationId: 'org-1', assistantId: 'another-assistant' })
    flushAngularEffects()
    expect(setOptions).not.toHaveBeenCalled()
    publications.changes$.next({ organizationId: 'org-1', assistantId: 'assistant-1' })
    flushAngularEffects()
    expect(setOptions).toHaveBeenCalledTimes(1)
    expect(createChatKitMock).toHaveBeenCalledTimes(createdBeforePublish)
    expect(setOptions.mock.calls[0][0].sessionKey).toBe(firstOptions.sessionKey)

    setOptions.mockClear()
    displayMode.set('chat')
    header.set(undefined)
    flushAngularEffects()

    expect(setOptions).toHaveBeenLastCalledWith(
      expect.objectContaining({
        displayMode: 'chat',
        messagePresentation,
        header: {
          title: {
            text: 'Assistant'
          }
        }
      })
    )

    displayMode.set('pet')
    header.set({
      rightAction: {
        icon: 'sidebar-right',
        onClick: rightHeaderAction
      }
    })

    createChatKitMock.mockClear()
    setOptions.mockClear()
    requestContext.set({
      env: {
        workspaceId: 'workspace-2',
        docxEditorDocumentId: 'doc-1'
      },
      docxEditor: {
        currentDocument: {
          documentId: 'doc-1',
          title: 'Document 1'
        }
      }
    })
    projectId.set('project-2')
    flushAngularEffects()

    // Retain Assistant-owned View documents; ChatKit resets chat state and
    // revalidates View access before publishing the new runtime context.
    expect(createChatKitMock).not.toHaveBeenCalled()
    expect(setOptions).toHaveBeenCalledTimes(1)
    expect(setOptions).toHaveBeenLastCalledWith(
      expect.objectContaining({
        displayMode: 'pet',
        layout,
        pet,
        workbench,
        api: expect.objectContaining({
          xpertId: 'assistant-1',
          projectId: 'project-2'
        }),
        messageNavigation: {
          enabled: true
        },
        request: {
          context: {
            env: {
              workspaceId: 'workspace-2',
              docxEditorDocumentId: 'doc-1'
            },
            docxEditor: {
              currentDocument: {
                documentId: 'doc-1',
                title: 'Document 1'
              }
            }
          }
        }
      })
    )

    setOptions.mockClear()
    projectId.set(null)
    flushAngularEffects()
    expect(createChatKitMock).not.toHaveBeenCalled()
    expect(setOptions).toHaveBeenCalledTimes(1)
    expect(setOptions.mock.calls[0][0].api).not.toHaveProperty('projectId')

    projectId.set('project-2')
    flushAngularEffects()
    createChatKitMock.mockClear()
    setOptions.mockClear()
    const mountedControl = control()
    loading.set(true)
    identity.set(null)
    assistantId.set(null)
    flushAngularEffects()
    expect(control()).toBe(mountedControl)
    expect(createChatKitMock).not.toHaveBeenCalled()
    expect(setOptions).not.toHaveBeenCalled()
    firstOptions.onProjectChange?.({ projectId: 'stale-project' })
    expect(onProjectChange).not.toHaveBeenCalled()

    identity.set('role-assistant')
    assistantId.set('role-assistant-1')
    initialThread.set('role-thread')
    loading.set(false)
    flushAngularEffects()

    // An Assistant change must rotate the delegated session/control before a
    // foreign persisted thread is selected.
    expect(createChatKitMock).toHaveBeenCalledTimes(1)
    expect(setOptions).not.toHaveBeenCalled()
    expect(createChatKitMock).toHaveBeenLastCalledWith(
      expect.objectContaining({
        initialThread: 'role-thread',
        api: expect.objectContaining({
          xpertId: 'role-assistant-1',
          projectId: 'project-2'
        })
      })
    )
    const roleOptions: CreateChatKitOptions = createChatKitMock.mock.calls[0][0]
    expect(roleOptions.sessionKey).not.toBe(firstOptions.sessionKey)
    firstOptions.onProjectChange?.({ projectId: 'stale-project' })
    expect(onProjectChange).not.toHaveBeenCalled()
    roleOptions.onProjectChange?.({ projectId: 'project-2' })
    expect(onProjectChange).toHaveBeenCalledWith({ projectId: 'project-2' })

    createChatKitMock.mockClear()
    setOptions.mockClear()
    loading.set(true)
    organizationId.next('org-2')
    flushAngularEffects()
    expect(control()).toBeNull()
    expect(createChatKitMock).not.toHaveBeenCalled()
    loading.set(false)
    flushAngularEffects()
    expect(createChatKitMock).toHaveBeenCalledTimes(1)
    expect(setOptions).not.toHaveBeenCalled()
    expect(createChatKitMock.mock.calls[0][0].sessionKey).not.toBe(roleOptions.sessionKey)
  })

  it('does not rebuild ChatKit options when only the routed thread changes', () => {
    const setOptions = jest.fn()
    const createChatKitMock = createChatKit as jest.Mock
    createChatKitMock.mockReturnValue({ setOptions })
    const initialThread = signal<string | null>('thread-1')

    TestBed.configureTestingModule({
      providers: [
        { provide: DOCUMENT, useValue: document },
        {
          provide: TranslateService,
          useValue: {
            currentLang: 'en',
            instant: (_key: string, params?: { Default?: string }) => params?.Default ?? _key
          }
        },
        { provide: ToastrService, useValue: { error: jest.fn() } },
        { provide: AppService, useValue: { lang: signal('en'), theme$: signal({ primary: 'light' }) } },
        {
          provide: Store,
          useValue: {
            token: 'token-1',
            token$: of('token-1'),
            organizationId: 'org-1',
            hasPermission: jest.fn(() => false),
            selectOrganizationId: () => of('org-1')
          }
        }
      ]
    })

    TestBed.runInInjectionContext(() => {
      injectHostedAssistantChatkitControl({
        identity: signal('xpert_shared'),
        assistantId: signal('assistant-1'),
        frameUrl: signal('/chatkit'),
        initialThread,
        titleKey: 'XP.Xpert.Assistant',
        titleDefault: 'Assistant'
      })
    })
    flushAngularEffects()

    expect(createChatKitMock).toHaveBeenCalledWith(expect.objectContaining({ initialThread: 'thread-1' }))
    setOptions.mockClear()
    initialThread.set('thread-2')
    flushAngularEffects()

    expect(createChatKitMock).toHaveBeenCalledTimes(1)
    expect(setOptions).not.toHaveBeenCalled()
  })

  it('passes an absolute same-origin API URL to ChatKit', () => {
    environment.API_BASE_URL = 'same-origin'
    const createChatKitMock = createChatKit as jest.Mock
    createChatKitMock.mockReturnValue({
      setOptions: jest.fn()
    })

    TestBed.configureTestingModule({
      providers: [
        {
          provide: DOCUMENT,
          useValue: document
        },
        {
          provide: TranslateService,
          useValue: {
            currentLang: 'en',
            instant: (_key: string, params?: { Default?: string }) => params?.Default ?? _key
          }
        },
        {
          provide: ToastrService,
          useValue: {
            error: jest.fn()
          }
        },
        {
          provide: AppService,
          useValue: {
            lang: signal('en'),
            theme$: signal({ primary: 'light' })
          }
        },
        {
          provide: Store,
          useValue: {
            token: 'token-1',
            token$: of('token-1'),
            organizationId: 'org-1',
            hasPermission: jest.fn(() => false),
            selectOrganizationId: () => of('org-1')
          }
        }
      ]
    })

    TestBed.runInInjectionContext(() => {
      injectHostedAssistantChatkitControl({
        identity: signal('xpert_shared'),
        assistantId: signal('assistant-1'),
        frameUrl: signal('/chatkit'),
        titleKey: 'XP.Xpert.Assistant',
        titleDefault: 'Assistant'
      })
    })
    flushAngularEffects()

    expect(createChatKitMock).toHaveBeenCalledWith(
      expect.objectContaining({
        api: expect.objectContaining({
          apiUrl: `${window.location.origin}/api/ai`
        })
      })
    )
  })

  it('uses a custom client secret resolver when provided', async () => {
    const createChatKitMock = createChatKit as jest.Mock
    const getClientSecret = jest.fn(async (currentClientSecret: string | null) => ({
      secret: `custom-${currentClientSecret}`,
      organizationId: 'org-custom'
    }))
    createChatKitMock.mockReturnValue({
      setOptions: jest.fn()
    })

    TestBed.configureTestingModule({
      providers: [
        {
          provide: DOCUMENT,
          useValue: document
        },
        {
          provide: TranslateService,
          useValue: {
            currentLang: 'en',
            instant: (_key: string, params?: { Default?: string }) => params?.Default ?? _key
          }
        },
        {
          provide: ToastrService,
          useValue: {
            error: jest.fn()
          }
        },
        {
          provide: AppService,
          useValue: {
            lang: signal('en'),
            theme$: signal({ primary: 'light' })
          }
        },
        {
          provide: Store,
          useValue: {
            token: 'token-1',
            token$: of('token-1'),
            organizationId: 'org-1',
            hasPermission: jest.fn(() => false),
            selectOrganizationId: () => of('org-1')
          }
        }
      ]
    })

    TestBed.runInInjectionContext(() => {
      injectHostedAssistantChatkitControl({
        identity: signal('public-chatkit:xpert-1'),
        assistantId: signal('xpert-1'),
        frameUrl: signal('/chatkit'),
        getClientSecret,
        title: signal('Public Assistant'),
        titleKey: 'XP.Xpert.Assistant',
        titleDefault: 'Assistant'
      })
    })
    flushAngularEffects()

    const options = createChatKitMock.mock.calls[0][0]
    await expect(options.api.getClientSecret('secret-1')).resolves.toEqual({
      secret: 'custom-secret-1',
      organizationId: 'org-custom'
    })
    expect(options.header.title.text).toBe('Public Assistant')
  })

  it('exchanges the platform login for a refreshable assistant-scoped ChatKit session', async () => {
    const createChatKitMock = createChatKit as jest.Mock
    const post = jest.fn(() => of({ client_secret: 'cs-x-session-1' }))
    createChatKitMock.mockReturnValue({ setOptions: jest.fn() })

    TestBed.configureTestingModule({
      providers: [
        { provide: DOCUMENT, useValue: document },
        { provide: HttpClient, useValue: { post } },
        {
          provide: TranslateService,
          useValue: {
            currentLang: 'en',
            instant: (_key: string, params?: { Default?: string }) => params?.Default ?? _key
          }
        },
        { provide: ToastrService, useValue: { error: jest.fn() } },
        { provide: AppService, useValue: { lang: signal('en'), theme$: signal({ primary: 'light' }) } },
        {
          provide: Store,
          useValue: {
            token: 'platform-token-1',
            token$: of('platform-token-1'),
            organizationId: 'org-1',
            hasPermission: jest.fn(() => false),
            selectOrganizationId: () => of('org-1')
          }
        }
      ]
    })

    TestBed.runInInjectionContext(() => {
      injectHostedAssistantChatkitControl({
        identity: signal('assistant-1'),
        assistantId: signal('assistant-1'),
        projectId: signal('project-1'),
        delegatedConversation: signal({
          conversationId: 'conversation-1',
          requesterXpertId: 'orchestrator-1'
        }),
        frameUrl: signal('/chatkit'),
        titleKey: 'XP.Xpert.Assistant',
        titleDefault: 'Assistant'
      })
    })
    flushAngularEffects()

    const options = createChatKitMock.mock.calls[0][0]
    await expect(options.api.getClientSecret('expired-secret')).resolves.toEqual({
      secret: 'cs-x-session-1',
      organizationId: 'org-1'
    })
    expect(post).toHaveBeenCalledWith('http://localhost:3000/api/ai/v1/chatkit/sessions', {
      assistant: { id: 'assistant-1' },
      project: { id: 'project-1' },
      conversation: {
        id: 'conversation-1',
        requesterXpertId: 'orchestrator-1'
      }
    })
  })

  it('keeps the shared Composer/Header/Workbench while isolating and refreshing group sessions', async () => {
    const createChatKitMock = createChatKit as jest.Mock
    const post = jest.fn(() => of({ client_secret: 'cs-x-group' }))
    const group = signal<{ id: string } | null>({ id: 'group-1' })
    createChatKitMock.mockImplementation(() => ({ setOptions: jest.fn() }))
    TestBed.configureTestingModule({
      providers: [
        { provide: DOCUMENT, useValue: document },
        { provide: HttpClient, useValue: { post } },
        { provide: TranslateService, useValue: { currentLang: 'en', instant: (key: string) => key } },
        { provide: ToastrService, useValue: { error: jest.fn() } },
        { provide: AppService, useValue: { lang: signal('en'), theme$: signal({ primary: 'light' }) } },
        {
          provide: Store,
          useValue: {
            token: 'platform',
            token$: of('platform'),
            organizationId: 'org-1',
            hasPermission: () => false,
            selectOrganizationId: () => of('org-1')
          }
        }
      ]
    })
    const rightAction = { icon: 'sidebar-right' as const, onClick: jest.fn() }
    TestBed.runInInjectionContext(() =>
      injectHostedAssistantChatkitControl({
        identity: signal('shared-host'),
        assistantId: signal('primary'),
        group,
        frameUrl: signal('/chatkit'),
        header: { rightAction },
        workbench: { enabled: true },
        composer: signal({ projects: { enabled: true }, connectors: { enabled: true } }),
        titleKey: 'Assistant',
        titleDefault: 'Assistant'
      })
    )
    flushAngularEffects()
    const first = createChatKitMock.mock.calls[0][0]
    expect(first.group).toEqual({ id: 'group-1' })
    expect(first.header.rightAction).toEqual(rightAction)
    expect(first.workbench.enabled).toBe(true)
    expect(first.composer).toEqual(
      expect.objectContaining({
        attachments: expect.objectContaining({ enabled: true }),
        projects: { enabled: true },
        connectors: expect.objectContaining({ enabled: true })
      })
    )
    await expect(first.api.getClientSecret(null)).resolves.toEqual({ secret: 'cs-x-group', organizationId: 'org-1' })
    await first.api.getClientSecret('expired')
    expect(post).toHaveBeenCalledTimes(2)
    expect(post).toHaveBeenLastCalledWith('http://localhost:3000/api/ai/v1/chatkit/sessions', {
      scope: { kind: 'conversation', conversationId: 'group-1' }
    })
    group.set({ id: 'group-2' })
    flushAngularEffects()
    const second = createChatKitMock.mock.calls[1][0]
    await second.api.getClientSecret(null)
    expect(post).toHaveBeenLastCalledWith('http://localhost:3000/api/ai/v1/chatkit/sessions', {
      scope: { kind: 'conversation', conversationId: 'group-2' }
    })
    // In-flight old clients remain bound to their own group, never the newly selected one.
    await first.api.getClientSecret(null)
    expect(post).toHaveBeenLastCalledWith('http://localhost:3000/api/ai/v1/chatkit/sessions', {
      scope: { kind: 'conversation', conversationId: 'group-1' }
    })
    post.mockReturnValueOnce(throwError(() => new Error('Membership revoked')))
    await expect(second.api.getClientSecret(null)).rejects.toThrow('Membership revoked')
    group.set(null)
    flushAngularEffects()
    const ordinary = createChatKitMock.mock.calls[2][0]
    expect(ordinary.group).toBeUndefined()
    expect(ordinary.messagePresentation).toBeUndefined()
  })

  it('resolves tool-output images through a fixed ArtifactVersion preview', async () => {
    const createChatKitMock = createChatKit as jest.Mock
    const createSignedVersionPreviewLink = jest.fn(() =>
      of({
        id: 'link-1',
        artifactId: 'artifact-1',
        publicUrl: 'https://artifacts.example.test/preview/image',
        expiresAt: '2026-08-17T12:05:00.000Z',
        version: {
          id: 'artifact-version-1',
          sha256: 'a'.repeat(64),
          mimeType: 'image/png'
        }
      })
    )
    createChatKitMock.mockReturnValue({ setOptions: jest.fn() })

    TestBed.configureTestingModule({
      providers: [
        { provide: DOCUMENT, useValue: document },
        {
          provide: TranslateService,
          useValue: {
            currentLang: 'en',
            instant: (_key: string, params?: { Default?: string }) => params?.Default ?? _key
          }
        },
        { provide: ToastrService, useValue: { error: jest.fn() } },
        { provide: AppService, useValue: { lang: signal('en'), theme$: signal({ primary: 'light' }) } },
        {
          provide: Store,
          useValue: {
            token: 'token-1',
            token$: of('token-1'),
            organizationId: 'org-1',
            hasPermission: jest.fn(() => false),
            selectOrganizationId: () => of('org-1')
          }
        },
        { provide: ArtifactService, useValue: { createSignedVersionPreviewLink } }
      ]
    })

    TestBed.runInInjectionContext(() => {
      injectHostedAssistantChatkitControl({
        identity: signal('xpert_shared'),
        assistantId: signal('assistant-1'),
        frameUrl: signal('/chatkit'),
        titleKey: 'XP.Xpert.Assistant',
        titleDefault: 'Assistant'
      })
    })
    flushAngularEffects()

    const options = createChatKitMock.mock.calls[0][0]
    await expect(
      options.toolOutputAttachments.onRequestPreview({
        attachment: {
          type: 'image',
          artifactId: 'artifact-1',
          artifactVersionId: 'artifact-version-1',
          sha256: 'a'.repeat(64),
          mimeType: 'image/png',
          source: 'knowledge-document',
          modelDetail: 'high'
        }
      })
    ).resolves.toEqual({
      previewUrl: 'https://artifacts.example.test/preview/image',
      expiresAt: '2026-08-17T12:05:00.000Z'
    })
    expect(createSignedVersionPreviewLink).toHaveBeenCalledWith('artifact-1', 'artifact-version-1')
  })
})
