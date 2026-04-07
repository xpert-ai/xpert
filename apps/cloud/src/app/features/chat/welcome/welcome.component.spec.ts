import { TestBed } from '@angular/core/testing'
import { provideRouter, Router } from '@angular/router'
import { TranslateModule } from '@ngx-translate/core'
import { BehaviorSubject } from 'rxjs'
import { clearChatCommonPendingInput, consumeChatCommonPendingInput } from '../common/pending-input.util'

jest.mock('../../../@shared/pipes', () => {
  const angularCore = jest.requireActual('@angular/core')

  class UserPipe {
    transform(value: unknown) {
      return value
    }
  }

  angularCore.Pipe({
    name: 'user',
    standalone: true
  })(UserPipe)

  return {
    UserPipe
  }
})

jest.mock('../xperts/xperts.component', () => {
  const angularCore = jest.requireActual('@angular/core')

  class ChatXpertsComponent {}

  angularCore.Component({
    selector: 'pac-chat-xperts',
    standalone: true,
    template: ''
  })(ChatXpertsComponent)

  return {
    ChatXpertsComponent
  }
})

jest.mock('apps/cloud/src/app/@core', () => {
  return {
    AssistantCode: {
      CHAT_COMMON: 'chat_common',
      XPERT_SHARED: 'xpert_shared',
      CHATBI: 'chatbi',
      CLAWXPERT: 'clawxpert'
    },
    AiFeatureEnum: {
      FEATURE_XPERT: 'FEATURE_XPERT',
      FEATURE_XPERT_CHATBI: 'FEATURE_XPERT_CHATBI',
      FEATURE_XPERT_CLAWXPERT: 'FEATURE_XPERT_CLAWXPERT'
    },
    RolesEnum: {
      SUPER_ADMIN: 'SUPER_ADMIN',
      ADMIN: 'ADMIN'
    },
    Store: class Store {}
  }
})

jest.mock('../../assistant/assistant-chatkit.runtime', () => {
  const { signal } = jest.requireActual('@angular/core')

  const runtimeState = {
    status: signal('ready')
  }

  return {
    injectAssistantChatkitRuntime: jest.fn(() => runtimeState),
    __runtimeState: runtimeState
  }
})

const { RolesEnum, Store } = jest.requireMock('apps/cloud/src/app/@core') as {
  RolesEnum: {
    SUPER_ADMIN: string
    ADMIN: string
  }
  Store: new (...args: unknown[]) => unknown
}
const runtimeState = jest.requireMock('../../assistant/assistant-chatkit.runtime').__runtimeState as {
  status: ReturnType<typeof import('@angular/core').signal<string>>
}
const { ChatCommonWelcomeComponent } = require('./welcome.component') as {
  ChatCommonWelcomeComponent: typeof import('./welcome.component').ChatCommonWelcomeComponent
}

describe('ChatCommonWelcomeComponent', () => {
  let router: Router
  let navigate: jest.SpyInstance
  let user$: BehaviorSubject<{
    role?: {
      name?: string | null
    } | null
  } | null>

  beforeEach(() => {
    clearChatCommonPendingInput()
    runtimeState.status.set('ready')
    user$ = new BehaviorSubject(null)

    TestBed.resetTestingModule()
    TestBed.configureTestingModule({
      imports: [TranslateModule.forRoot(), ChatCommonWelcomeComponent],
      providers: [
        provideRouter([]),
        {
          provide: Store,
          useValue: {
            user$: user$.asObservable()
          }
        }
      ]
    })

    router = TestBed.inject(Router)
    navigate = jest.spyOn(router, 'navigate').mockResolvedValue(true)
  })

  afterEach(() => {
    clearChatCommonPendingInput()
    TestBed.resetTestingModule()
    jest.clearAllMocks()
  })

  it('stores the prompt and navigates to the common chat route with router state', async () => {
    const fixture = TestBed.createComponent(ChatCommonWelcomeComponent)
    fixture.componentInstance.promptControl.setValue('Summarize today\'s customer tickets')

    await fixture.componentInstance.submit()

    expect(navigate).toHaveBeenCalledWith(['/chat/x/common'], {
      state: {
        input: 'Summarize today\'s customer tickets'
      }
    })
    expect(consumeChatCommonPendingInput()).toBe('Summarize today\'s customer tickets')
    expect(fixture.componentInstance.promptControl.getRawValue()).toBe('')
  })

  it('clears pending input when navigation to the common chat route fails', async () => {
    navigate.mockResolvedValue(false)

    const fixture = TestBed.createComponent(ChatCommonWelcomeComponent)
    fixture.componentInstance.promptControl.setValue('Write a launch brief')

    await fixture.componentInstance.submit()

    expect(consumeChatCommonPendingInput()).toBeNull()
  })

  it('hides the common assistant card when the assistant is ready', () => {
    runtimeState.status.set('ready')

    const fixture = TestBed.createComponent(ChatCommonWelcomeComponent)
    fixture.detectChanges()

    expect(fixture.componentInstance.showAssistantCard()).toBe(false)
    expect(fixture.nativeElement.textContent).not.toContain('PAC.Assistant.ChatCommon.Label')
  })

  it('shows the common assistant card when the assistant is not ready', () => {
    runtimeState.status.set('missing')

    const fixture = TestBed.createComponent(ChatCommonWelcomeComponent)
    fixture.detectChanges()

    expect(fixture.componentInstance.showAssistantCard()).toBe(true)
    expect(fixture.nativeElement.textContent).toContain('PAC.Assistant.ChatCommon.Label')
  })

  it('shows the change settings action beside the composer title for admins only', () => {
    user$.next({
      role: {
        name: RolesEnum.ADMIN
      }
    })

    const fixture = TestBed.createComponent(ChatCommonWelcomeComponent)
    fixture.detectChanges()

    expect(fixture.componentInstance.canManageAssistantSettings()).toBe(true)
    expect(fixture.componentInstance.showChangeSettingsAction()).toBe(true)
    expect(fixture.nativeElement.textContent).toContain('PAC.Assistant.ChangeSettings')
  })

  it('does not show the change settings action for users without settings access', () => {
    user$.next({
      role: {
        name: 'MEMBER'
      }
    })

    const fixture = TestBed.createComponent(ChatCommonWelcomeComponent)
    fixture.detectChanges()

    expect(fixture.componentInstance.canManageAssistantSettings()).toBe(false)
    expect(fixture.componentInstance.showChangeSettingsAction()).toBe(false)
    expect(fixture.nativeElement.textContent).not.toContain('PAC.Assistant.ChangeSettings')
  })
})
