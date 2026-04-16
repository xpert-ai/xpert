import { HttpClient } from '@angular/common/http'
import { ReactiveFormsModule } from '@angular/forms'
import { TestBed } from '@angular/core/testing'
import { ActivatedRoute, convertToParamMap, Router } from '@angular/router'
import { CookieService } from 'ngx-cookie-service'
import { BehaviorSubject, of } from 'rxjs'
import { PAC_AUTH_OPTIONS } from '../auth.options'
import { PacAuthService } from '../services/auth.service'
import { UserLoginComponent } from './login.component'

type SSOProviderDescriptor = {
  provider: string
  displayName: string
  icon: string
  order: number
  startUrl: string
}

describe('UserLoginComponent', () => {
  afterEach(() => {
    TestBed.resetTestingModule()
    jest.clearAllMocks()
  })

  async function createFixture(
    queryParams: Record<string, string> = {},
    providers: SSOProviderDescriptor[] = []
  ) {
    const queryParamMap$ = new BehaviorSubject(convertToParamMap(queryParams))

    await TestBed.configureTestingModule({
      declarations: [UserLoginComponent],
      imports: [ReactiveFormsModule],
      providers: [
        {
          provide: HttpClient,
          useValue: {
            get: jest.fn(() => of({ providers }))
          }
        },
        {
          provide: CookieService,
          useValue: {
            check: jest.fn(() => false),
            getAll: jest.fn(() => ({}))
          }
        },
        {
          provide: PAC_AUTH_OPTIONS,
          useValue: {
            forms: {
              login: {
                showMessages: {
                  error: true
                },
                redirectDelay: 0,
                strategy: 'email'
              }
            }
          }
        },
        {
          provide: PacAuthService,
          useValue: {
            authenticate: jest.fn(() =>
              of({
                isSuccess: () => true,
                getMessages: () => [],
                getErrors: () => [],
                getRedirect: () => null
              })
            )
          }
        },
        {
          provide: Router,
          useValue: {
            navigateByUrl: jest.fn()
          }
        },
        {
          provide: ActivatedRoute,
          useValue: {
            queryParamMap: queryParamMap$.asObservable(),
            snapshot: {
              queryParams
            }
          }
        }
      ]
    })
      .overrideComponent(UserLoginComponent, {
        set: {
          template: ''
        }
      })
      .compileComponents()

    const fixture = TestBed.createComponent(UserLoginComponent)
    fixture.detectChanges()

    return {
      fixture,
      component: fixture.componentInstance,
      queryParamMap$
    }
  }

  it('shows the callback error message from SSO query params', async () => {
    const { component } = await createFixture({
      ssoProvider: 'lark',
      ssoError: 'oauth_failed',
      ssoMessage: 'Feishu OAuth failed: User denied access.',
      returnUrl: '/chat'
    })

    expect(component.errors).toEqual(['Feishu OAuth failed: User denied access.'])
  })

  it('falls back to a generic provider message when only the SSO error code is present', async () => {
    const { component, queryParamMap$, fixture } = await createFixture(
      {},
      [
        {
          provider: 'lark',
          displayName: 'Feishu',
          icon: '/feishu.png',
          order: 1,
          startUrl: '/api/lark-identity/login/start'
        }
      ]
    )

    queryParamMap$.next(
      convertToParamMap({
        ssoProvider: 'lark',
        ssoError: 'state_invalid'
      })
    )
    fixture.detectChanges()

    expect(component.errors).toEqual(['Feishu sign-in failed. Please try again.'])
  })
})
