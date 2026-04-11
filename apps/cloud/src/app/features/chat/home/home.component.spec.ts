import { Component, NO_ERRORS_SCHEMA, signal } from '@angular/core'
import { TestBed } from '@angular/core/testing'
import { Dialog } from '@angular/cdk/dialog'
import { provideRouter, Router } from '@angular/router'
import { provideNoopAnimations } from '@angular/platform-browser/animations'
import { TranslateModule } from '@ngx-translate/core'
import { NGXLogger } from 'ngx-logger'
import { Observable, of } from 'rxjs'
import { ChatHomeComponent } from './home.component'
import { ChatHomeService } from '../home.service'
import { ClawXpertFacade } from '../clawxpert/clawxpert.facade'
import { AppService } from '../../../app.service'
import { XpertHomeService } from '../../../xpert'

const mockProjectService = {
  getAllMy: jest.fn(() => of({ items: [] })),
  create: jest.fn(() => of({ id: 'project-1' })),
  update: jest.fn(() => of({})),
  delete: jest.fn(() => of({}))
}

const mockToastr = {
  success: jest.fn(),
  error: jest.fn()
}

jest.mock('@xpert-ai/cloud/state', () => {
  const { signal } = jest.requireActual('@angular/core')

  return {
    injectUserPreferences: () => signal({ chatSidebar: 'expanded' })
  }
})

jest.mock('@xpert-ai/headless-ui', () => {
  const { Directive, Input } = jest.requireActual('@angular/core')

  @Directive({
    standalone: true,
    selector: '[zTooltip]'
  })
  class ZTooltipDirective {
    @Input() zTooltip?: string
    @Input() zPosition?: string
    @Input() zDisabled?: boolean
  }

  return {
    ZardTooltipImports: [ZTooltipDirective]
  }
})

jest.mock('@xpert-ai/core', () => {
  const { trigger } = jest.requireActual('@angular/animations')

  return {
    OverlayAnimations: [trigger('overlayAnimation1', [])],
    routeAnimations: trigger('routeAnimations', [])
  }
})

jest.mock('@xpert-ai/ocap-core', () => ({
  DisplayBehaviour: {
    Auto: 'auto'
  }
}))

jest.mock('@xpert-ai/ocap-angular/common', () => {
  const { Component } = jest.requireActual('@angular/core')

  @Component({
    standalone: true,
    selector: 'ngm-spin',
    template: ''
  })
  class NgmSpinComponent {}

  return {
    NgmSpinComponent
  }
})

jest.mock('@xpert-ai/ocap-angular/core', () => {
  const { Pipe, effect, signal } = jest.requireActual('@angular/core')

  @Pipe({
    standalone: true,
    name: 'ngmI18n'
  })
  class NgmI18nPipe {
    transform(value: string) {
      return value
    }
  }

  function attrModel(
    source: {
      (): Record<string, unknown>
      update: (updater: (state: Record<string, unknown>) => Record<string, unknown>) => void
    },
    key: string
  ) {
    const model = signal(source()[key] ?? null)
    const originalSet = model.set.bind(model)

    model.set = (value) => {
      source.update((state) => ({
        ...state,
        [key]: value
      }))
      originalSet(value)
    }

    return model
  }

  function linkedModel({
    initialValue,
    compute,
    update
  }: {
    initialValue: unknown
    compute: () => unknown
    update: (value: unknown) => void
  }) {
    const model = signal(initialValue)
    const originalSet = model.set.bind(model)

    effect(() => {
      originalSet(compute())
    })

    model.set = (value) => {
      update(value)
      originalSet(value)
    }

    return model
  }

  function myRxResource(options?: { loader?: () => unknown }) {
    return {
      status: signal('resolved'),
      value: signal(null)
    }
  }

  return {
    NgmI18nPipe,
    attrModel,
    linkedModel,
    myRxResource
  }
})

jest.mock('@cloud/app/@shared/avatar/emoji-avatar/avatar.component', () => {
  const { Component, Input } = jest.requireActual('@angular/core')

  @Component({
    standalone: true,
    selector: 'emoji-avatar',
    template: ''
  })
  class EmojiAvatarComponent {
    @Input() avatar?: unknown
    @Input() alt?: string
    @Input() fallbackLabel?: string
  }

  return {
    EmojiAvatarComponent
  }
})

jest.mock('../clawxpert/clawxpert.facade', () => ({
  ClawXpertFacade: class ClawXpertFacade {}
}))

jest.mock('../../../@core', () => {
  const { of } = jest.requireActual('rxjs')

  class ChatConversationService {}
  class Store {}

  return {
    AiFeatureEnum: {
      FEATURE_XPERT: 'FEATURE_XPERT',
      FEATURE_XPERT_CLAWXPERT: 'FEATURE_XPERT_CLAWXPERT',
      FEATURE_XPERT_CHATBI: 'FEATURE_XPERT_CHATBI',
      FEATURE_XPERT_CODEXPERT: 'FEATURE_XPERT_CODEXPERT',
      FEATURE_XPERT_DEEP_RESEARCH: 'FEATURE_XPERT_DEEP_RESEARCH'
    },
    ChatConversationService,
    Store,
    OrderTypeEnum: {
      DESC: 'DESC'
    },
    getErrorMessage: (error: any) => error?.message ?? '',
    injectProjectService: () => mockProjectService,
    injectToastr: () => mockToastr
  }
})

jest.mock('../../../xpert', () => ({
  ChatConversationsComponent: class ChatConversationsComponent {},
  XpertHomeService: class XpertHomeService {}
}))

jest.mock('@cloud/app/@shared/chat/task-dialog/task-dialog.component', () => ({
  XpertTaskDialogComponent: class XpertTaskDialogComponent {}
}))

const { ChatConversationService, Store } = jest.requireMock('../../../@core') as {
  ChatConversationService: new (...args: any[]) => unknown
  Store: new (...args: any[]) => unknown
}

@Component({
  standalone: true,
  template: ''
})
class DummyComponent {}

describe('ChatHomeComponent', () => {
  let homeService: {
    conversationId: ReturnType<typeof signal<string | null>>
    conversation: ReturnType<typeof signal<any>>
    xpert: ReturnType<typeof signal<any>>
  }
  let clawxpertFacade: {
    definition: { defaultLabel: string }
    currentXpert: ReturnType<typeof signal<any>>
    currentXpertAvatar: ReturnType<typeof signal<any>>
    viewState: ReturnType<typeof signal<'ready' | 'wizard' | 'error' | 'organization-required'>>
    sidebarStatus: ReturnType<typeof signal<'setup' | 'idle' | 'busy'>>
  }
  let conversationService: {
    getMyInOrg: jest.Mock
    delete: jest.Mock
  }
  let store: {
    featureOrganizations$: Observable<unknown[]>
    featureTenant$: Observable<unknown[]>
    hasFeatureEnabled: jest.Mock
  }
  let dialog: {
    open: jest.Mock
  }
  let logger: {
    debug: jest.Mock
  }
  let appService: {
    isMobile: ReturnType<typeof signal<boolean>>
    lang: ReturnType<typeof signal<string>>
  }

  beforeEach(async () => {
    homeService = {
      conversationId: signal(null),
      conversation: signal(null),
      xpert: signal(null)
    }
    clawxpertFacade = {
      definition: {
        defaultLabel: 'ClawXpert'
      },
      currentXpert: signal(null),
      currentXpertAvatar: signal(null),
      viewState: signal('wizard'),
      sidebarStatus: signal('setup')
    }
    conversationService = {
      getMyInOrg: jest.fn(() => of({ items: [], total: 0 })),
      delete: jest.fn(() => of({}))
    }
    store = {
      featureOrganizations$: of([]),
      featureTenant$: of([]),
      hasFeatureEnabled: jest.fn((feature: string) =>
        ['FEATURE_XPERT', 'FEATURE_XPERT_CLAWXPERT', 'FEATURE_XPERT_CHATBI'].includes(feature)
      )
    }
    dialog = {
      open: jest.fn(() => ({ closed: of(null) }))
    }
    logger = {
      debug: jest.fn()
    }
    appService = {
      isMobile: signal(false),
      lang: signal('zh-CN')
    }

    TestBed.resetTestingModule()
    TestBed.overrideComponent(ChatHomeComponent, {
      set: {
        providers: [
          {
            provide: ChatHomeService,
            useValue: homeService
          },
          {
            provide: XpertHomeService,
            useValue: homeService
          },
          {
            provide: ClawXpertFacade,
            useValue: clawxpertFacade
          }
        ]
      }
    })

    await TestBed.configureTestingModule({
      imports: [TranslateModule.forRoot(), ChatHomeComponent],
      providers: [
        provideRouter([
          { path: 'chat/clawxpert', component: DummyComponent },
          { path: 'chat/clawxpert/c', component: DummyComponent },
          { path: 'chat/tasks', component: DummyComponent },
          { path: '**', component: DummyComponent }
        ]),
        provideNoopAnimations(),
        {
          provide: ChatConversationService,
          useValue: conversationService
        },
        {
          provide: Store,
          useValue: store
        },
        {
          provide: Dialog,
          useValue: dialog
        },
        {
          provide: NGXLogger,
          useValue: logger
        },
        {
          provide: AppService,
          useValue: appService
        }
      ],
      schemas: [NO_ERRORS_SCHEMA]
    }).compileComponents()
  })

  afterEach(() => {
    TestBed.resetTestingModule()
    jest.clearAllMocks()
  })

  it('renders the bound ClawXpert title and busy status in the sidebar card', async () => {
    clawxpertFacade.currentXpert.set({ title: '扣子', name: 'ClawXpert Internal' })
    clawxpertFacade.viewState.set('ready')
    clawxpertFacade.sidebarStatus.set('busy')

    const fixture = TestBed.createComponent(ChatHomeComponent)
    fixture.detectChanges()
    await fixture.whenStable()
    fixture.detectChanges()

    expect(fixture.nativeElement.querySelector('[data-clawxpert-title]').textContent).toContain('扣子')
    expect(fixture.nativeElement.querySelector('[data-clawxpert-status]').textContent).toContain(
      'PAC.Chat.ClawXpert.SidebarStatusBusy'
    )
  })

  it('keeps the ClawXpert avatar and compact status visible when the sidebar is collapsed', async () => {
    clawxpertFacade.currentXpert.set({ title: '扣子', name: 'ClawXpert Internal' })
    clawxpertFacade.viewState.set('ready')
    clawxpertFacade.sidebarStatus.set('busy')

    const fixture = TestBed.createComponent(ChatHomeComponent)
    fixture.componentInstance.sidebarState.set('closed')

    fixture.detectChanges()
    await fixture.whenStable()
    fixture.detectChanges()

    expect(fixture.nativeElement.querySelector('[data-clawxpert-card]').getAttribute('data-state')).toBe('closed')
    expect(fixture.nativeElement.querySelector('[data-clawxpert-avatar]')).not.toBeNull()
    expect(fixture.nativeElement.querySelector('[data-clawxpert-status-compact]').textContent).toContain(
      'PAC.Chat.ClawXpert.SidebarStatusBusy'
    )
  })

  it('falls back to the ClawXpert name and idle status when no title exists', async () => {
    clawxpertFacade.currentXpert.set({ name: '助手' })
    clawxpertFacade.viewState.set('ready')
    clawxpertFacade.sidebarStatus.set('idle')

    const fixture = TestBed.createComponent(ChatHomeComponent)
    fixture.detectChanges()
    await fixture.whenStable()
    fixture.detectChanges()

    expect(fixture.nativeElement.querySelector('[data-clawxpert-title]').textContent).toContain('助手')
    expect(fixture.nativeElement.querySelector('[data-clawxpert-status]').textContent).toContain(
      'PAC.Chat.ClawXpert.SidebarStatusIdle'
    )
  })

  it('navigates the main card to chat and the settings button to the setup page', async () => {
    clawxpertFacade.currentXpert.set({ title: '扣子' })
    clawxpertFacade.viewState.set('ready')
    clawxpertFacade.sidebarStatus.set('busy')

    const fixture = TestBed.createComponent(ChatHomeComponent)
    const router = TestBed.inject(Router)
    const navigateSpy = jest.spyOn(router, 'navigateByUrl').mockResolvedValue(true)

    fixture.detectChanges()
    await fixture.whenStable()
    fixture.detectChanges()

    fixture.nativeElement.querySelector('[data-clawxpert-open]').click()
    fixture.nativeElement.querySelector('[data-clawxpert-settings]').click()

    expect(navigateSpy).toHaveBeenNthCalledWith(1, '/chat/clawxpert/c')
    expect(navigateSpy).toHaveBeenNthCalledWith(2, '/chat/clawxpert')
  })

  it('shows the setup status and opens the setup page when ClawXpert is not configured', async () => {
    clawxpertFacade.currentXpert.set(null)
    clawxpertFacade.viewState.set('wizard')
    clawxpertFacade.sidebarStatus.set('setup')

    const fixture = TestBed.createComponent(ChatHomeComponent)
    const router = TestBed.inject(Router)
    const navigateSpy = jest.spyOn(router, 'navigateByUrl').mockResolvedValue(true)

    fixture.detectChanges()
    await fixture.whenStable()
    fixture.detectChanges()

    expect(fixture.nativeElement.querySelector('[data-clawxpert-title]').textContent).toContain('ClawXpert')
    expect(fixture.nativeElement.querySelector('[data-clawxpert-status]').textContent).toContain(
      'PAC.Chat.ClawXpert.SidebarStatusSetup'
    )

    fixture.nativeElement.querySelector('[data-clawxpert-open]').click()

    expect(navigateSpy).toHaveBeenCalledWith('/chat/clawxpert')
  })
})
