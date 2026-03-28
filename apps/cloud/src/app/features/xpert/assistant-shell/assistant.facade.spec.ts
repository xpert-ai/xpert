import { TestBed } from '@angular/core/testing'
import { signal } from '@angular/core'
import { Subject, of } from 'rxjs'
import { Router } from '@angular/router'
import { TranslateService } from '@ngx-translate/core'

const createChatKitMock = jest.fn((_options: unknown) => ({
  setOptions: jest.fn()
}))

jest.mock('apps/cloud/src/app/@core', () => ({
  ToastrService: class ToastrService {},
  XpertAPIService: class XpertAPIService {}
}))

jest.mock('apps/cloud/src/app/app.service', () => ({
  AppService: class AppService {}
}))

jest.mock('@metad/cloud/state', () => ({
  injectWorkspace: () => (() => ({ id: 'selected-workspace' }))
}))

jest.mock('@xpert-ai/chatkit-angular', () => ({
  createChatKit: (options: unknown) => createChatKitMock(options)
}))

jest.mock('apps/cloud/src/environments/environment', () => ({
  environment: {
    CHATKIT_XPERT_ID: 'assistant-1',
    CHATKIT_FRAME_URL: 'https://frame.example.com',
    CHATKIT_API_URL: 'https://api.example.com',
    CHATKIT_API_KEY: 'secret',
    API_BASE_URL: 'https://fallback.example.com'
  }
}))

import { ToastrService, XpertAPIService } from 'apps/cloud/src/app/@core'
import { AppService } from 'apps/cloud/src/app/app.service'
import { XpertAssistantFacade } from './assistant.facade'

describe('XpertAssistantFacade', () => {
  beforeEach(() => {
    jest.spyOn(console, 'warn').mockImplementation(() => {})
  })

  afterEach(() => {
    jest.restoreAllMocks()
  })

  const createFacade = (url: string) => {
    const routerEvents$ = new Subject<unknown>()
    const router = {
      url,
      events: routerEvents$.asObservable(),
      navigate: jest.fn()
    }

    TestBed.resetTestingModule()
    TestBed.configureTestingModule({
      providers: [
        XpertAssistantFacade,
        {
          provide: Router,
          useValue: router
        },
        {
          provide: TranslateService,
          useValue: {
            currentLang: 'en',
            instant: jest.fn((_key: string, params?: { Default?: string }) => params?.Default ?? 'translated')
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
            isMobile: signal(false),
            lang: signal('en'),
            theme$: signal({ primary: 'light' })
          }
        },
        {
          provide: XpertAPIService,
          useValue: {
            getTeam: jest.fn().mockReturnValue(of({ workspaceId: 'workspace-from-team' }))
          }
        }
      ]
    })

    return {
      router,
      facade: TestBed.inject(XpertAssistantFacade)
    }
  }

  it('omits env.xpertId on workspace routes', () => {
    const { facade } = createFacade('/xpert/w/workspace-1')

    const options = (facade as any).buildChatKitOptions('assistant-1', {
      workspaceId: 'workspace-1',
      xpertId: null
    })

    expect(options.request.context).toEqual({
      env: {
        workspaceId: 'workspace-1'
      }
    })
  })

  it('includes env.xpertId on studio routes', () => {
    const { facade } = createFacade('/xpert/x/xpert-1/agents')

    const options = (facade as any).buildChatKitOptions('assistant-1', {
      workspaceId: 'workspace-1',
      xpertId: 'xpert-1'
    })

    expect(options.request.context).toEqual({
      env: {
        workspaceId: 'workspace-1',
        xpertId: 'xpert-1'
      }
    })
  })

  it('only includes studio runtime fields when the current page is studio', () => {
    const { facade } = createFacade('/xpert/x/xpert-1/agents')
    const workspaceOptions = (facade as any).buildChatKitOptions('assistant-1', {
      workspaceId: 'workspace-1',
      xpertId: null
    })
    const studioOptions = (facade as any).buildChatKitOptions(
      'assistant-1',
      {
        workspaceId: 'workspace-1',
        xpertId: 'xpert-1'
      },
      undefined,
      {
        targetXpertId: 'xpert-1',
        baseDraftHash: 'hash-from-pristine',
        unsaved: true
      }
    )

    expect(workspaceOptions.request.context).toEqual({
      env: {
        workspaceId: 'workspace-1'
      }
    })
    expect(studioOptions.request.context).toEqual({
      env: {
        workspaceId: 'workspace-1',
        xpertId: 'xpert-1'
      },
      targetXpertId: 'xpert-1',
      baseDraftHash: 'hash-from-pristine',
      unsaved: true
    })
  })
})
