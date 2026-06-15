import { DOCUMENT } from '@angular/common'
import { signal } from '@angular/core'
import { TestBed } from '@angular/core/testing'
import { TranslateService } from '@ngx-translate/core'
import { createChatKit } from '@xpert-ai/chatkit-angular'
import { of } from 'rxjs'
import { AppService } from '../../app.service'
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
  injectHostedAssistantChatkitControl
} from './assistant-chatkit.runtime'

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
  beforeEach(() => {
    jest.clearAllMocks()
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
    expect(hasCompleteAssistantBinding(createResolvedBinding({ assistantId: null }), 'https://chatkit.example.com')).toBe(
      false
    )
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
        requestContext,
        displayMode: 'pet',
        pet,
        titleKey: 'PAC.Xpert.Assistant',
        titleDefault: 'Assistant'
      })
    })
    flushAngularEffects()

    expect(createChatKitMock).toHaveBeenCalledWith(
      expect.objectContaining({
        displayMode: 'pet',
        pet,
        request: {
          context: {
            env: {
              workspaceId: 'workspace-1'
            }
          }
        }
      })
    )

    requestContext.set({
      env: {
        workspaceId: 'workspace-2'
      }
    })
    flushAngularEffects()

    expect(setOptions).toHaveBeenCalledWith(
      expect.objectContaining({
        displayMode: 'pet',
        pet,
        request: {
          context: {
            env: {
              workspaceId: 'workspace-2'
            }
          }
        }
      })
    )
  })
})
