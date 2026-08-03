import { HttpClient } from '@angular/common/http'
import { Component } from '@angular/core'
import { TestBed } from '@angular/core/testing'
import { ReactiveFormsModule } from '@angular/forms'
import { ActivatedRoute, convertToParamMap, Router } from '@angular/router'
import { TranslateService } from '@ngx-translate/core'
import { ReferralService } from '@cloud/app/@core/state'
import { of, throwError } from 'rxjs'
import { XP_AUTH_OPTIONS } from '../auth.options'
import { XpAuthService } from '../services/auth.service'
import { UserRegisterComponent } from './register.component'

@Component({
  standalone: false,
  template: ''
})
class TestUserRegisterComponent extends UserRegisterComponent {
  override redirectToLocation = jest.fn()
}

describe('UserRegisterComponent SSO registration', () => {
  afterEach(() => {
    TestBed.resetTestingModule()
    jest.clearAllMocks()
  })

  async function createFixture(
    challenge: {
      flow: 'anonymous_bind' | 'verified_email_signup'
      provider: string
      email?: string
      displayName?: string
      avatarUrl?: string
      tenantScoped: true
      expiresAt: string
    },
    referralEnabled = true,
    options: {
      challengeError?: { error: { message: string } }
      postError?: { status: number; error: { message: string } }
      postResult?: { location: string }
      enablePublicSignup?: boolean
      providers?: Array<{
        provider: string
        displayName: string
        icon: string
        order: number
        startUrl: string
      }>
    } = {}
  ) {
    const httpClient = {
      get: jest.fn((url: string) => {
        if (url === '/api/auth/sso/bind/challenge') {
          if (options.challengeError) {
            return throwError(() => options.challengeError)
          }
          return of(challenge)
        }
        return of({ providers: options.providers ?? [] })
      }),
      post: jest.fn(() => {
        if (options.postResult) {
          return of(options.postResult)
        }
        return throwError(
          () =>
            options.postError ?? {
              error: {
                message: 'Test stopped before redirect.'
              }
            }
        )
      })
    }
    const referralService = {
      getAvailability: jest.fn(async () => referralEnabled),
      validateCode: jest.fn(async () => true)
    }

    await TestBed.configureTestingModule({
      declarations: [TestUserRegisterComponent],
      imports: [ReactiveFormsModule],
      providers: [
        { provide: HttpClient, useValue: httpClient },
        { provide: ReferralService, useValue: referralService },
        {
          provide: TranslateService,
          useValue: {
            get: jest.fn((key: string) => of(key))
          }
        },
        {
          provide: XP_AUTH_OPTIONS,
          useValue: {
            forms: {
              register: {
                enablePublicSignup: options.enablePublicSignup ?? true,
                redirectDelay: 0,
                showMessages: {
                  error: true
                },
                strategy: 'email'
              },
              login: {
                socialLinks: []
              }
            }
          }
        },
        {
          provide: XpAuthService,
          useValue: {
            register: jest.fn()
          }
        },
        {
          provide: ActivatedRoute,
          useValue: {
            snapshot: {
              queryParamMap: convertToParamMap({ ticket: 'sso-ticket' })
            }
          }
        },
        {
          provide: Router,
          useValue: {
            navigate: jest.fn(),
            navigateByUrl: jest.fn()
          }
        }
      ]
    }).compileComponents()

    const fixture = TestBed.createComponent(TestUserRegisterComponent)
    fixture.detectChanges()
    await fixture.whenStable()

    return {
      component: fixture.componentInstance,
      httpClient,
      referralService,
      router: TestBed.inject(Router)
    }
  }

  it('uses the challenge email as a locked value for verified email signup', async () => {
    const { component, httpClient } = await createFixture({
      flow: 'verified_email_signup',
      provider: 'github-sso',
      email: 'verified@example.com',
      displayName: 'Octo Cat',
      avatarUrl: 'https://avatars.githubusercontent.com/u/1',
      tenantScoped: true,
      expiresAt: '2026-07-30T12:00:00.000Z'
    })

    expect(httpClient.get).toHaveBeenCalledWith('/api/auth/sso/bind/challenge', {
      params: {
        ticket: 'sso-ticket'
      }
    })
    expect(component.verifiedEmailSignup).toBe(true)
    expect(component.email.value).toBe('verified@example.com')
    expect(component.emailLocked).toBe(true)
    expect(component.ssoChallenge?.displayName).toBe('Octo Cat')
  })

  it('uses the plugin provider display name for the registration copy and preserves generic fallbacks', async () => {
    const { component } = await createFixture(
      {
        flow: 'verified_email_signup',
        provider: 'github-sso',
        email: 'verified@example.com',
        tenantScoped: true,
        expiresAt: '2026-07-30T12:00:00.000Z'
      },
      true,
      {
        providers: [
          {
            provider: 'github-sso',
            displayName: 'GitHub from plugin',
            icon: '/api/github-identity/icon.svg',
            order: 110,
            startUrl: '/api/github-identity/login/start'
          }
        ]
      }
    )

    expect(component.providerLabel('github-sso')).toBe('GitHub from plugin')
    expect(component.providerLabel('custom-sso')).toBe('custom-sso')
    expect(component.providerLabel(' ')).toBe('SSO')
  })

  it('preserves the existing editable registration form for anonymous binding tickets', async () => {
    const { component, referralService } = await createFixture({
      flow: 'anonymous_bind',
      provider: 'lark',
      displayName: 'Lark User',
      tenantScoped: true,
      expiresAt: '2026-07-30T12:00:00.000Z'
    })

    expect(component.verifiedEmailSignup).toBe(false)
    expect(component.emailLocked).toBe(false)
    expect(component.email.value).toBeNull()
    expect(referralService.getAvailability).toHaveBeenCalledTimes(1)
  })

  it('submits the verified challenge email with password and optional referral code', async () => {
    const { component, httpClient } = await createFixture({
      flow: 'verified_email_signup',
      provider: 'github-sso',
      email: 'verified@example.com',
      tenantScoped: true,
      expiresAt: '2026-07-30T12:00:00.000Z'
    })
    component.form.patchValue({
      password: 'strong-password',
      confirm: 'strong-password',
      referralCode: 'ABCDEF2345'
    })

    await component.register()

    expect(httpClient.post).toHaveBeenCalledWith('/api/auth/sso/bind/register', {
      ticket: 'sso-ticket',
      email: 'verified@example.com',
      password: 'strong-password',
      confirmPassword: 'strong-password',
      referralCode: 'ABCDEF2345'
    })
  })

  it('shows an expired challenge error and keeps registration unavailable', async () => {
    const { component } = await createFixture(
      {
        flow: 'verified_email_signup',
        provider: 'github-sso',
        email: 'verified@example.com',
        tenantScoped: true,
        expiresAt: '2026-07-30T12:00:00.000Z'
      },
      true,
      {
        challengeError: {
          error: {
            message: 'SSO binding session has expired. Please sign in again.'
          }
        }
      }
    )

    expect(component.ssoChallenge).toBeNull()
    expect(component.ssoChallengeLoadError).toBe('SSO binding session has expired. Please sign in again.')
  })

  it('preserves the ticket and form values after a binding conflict', async () => {
    const { component } = await createFixture(
      {
        flow: 'verified_email_signup',
        provider: 'github-sso',
        email: 'verified@example.com',
        tenantScoped: true,
        expiresAt: '2026-07-30T12:00:00.000Z'
      },
      false,
      {
        postError: {
          status: 409,
          error: {
            message: 'This GitHub identity is already bound.'
          }
        }
      }
    )
    component.form.patchValue({
      password: 'strong-password',
      confirm: 'strong-password'
    })

    await component.register()

    expect(component.ssoTicket).toBe('sso-ticket')
    expect(component.password.value).toBe('strong-password')
    expect(component.confirm.value).toBe('strong-password')
    expect(component.submitted).toBe(false)
    expect(component.errors).toEqual(['This GitHub identity is already bound.'])
  })

  it('redirects to the host-provided sign-in success location after registration', async () => {
    const { component } = await createFixture(
      {
        flow: 'verified_email_signup',
        provider: 'github-sso',
        email: 'verified@example.com',
        tenantScoped: true,
        expiresAt: '2026-07-30T12:00:00.000Z'
      },
      false,
      {
        postResult: {
          location: '/sign-in/success?jwt=token'
        }
      }
    )
    component.form.patchValue({
      password: 'strong-password',
      confirm: 'strong-password'
    })

    await component.register()

    expect(component.redirectToLocation).toHaveBeenCalledWith('/sign-in/success?jwt=token')
  })

  it('allows a verified signup ticket when public registration is disabled', async () => {
    const { component, router } = await createFixture(
      {
        flow: 'verified_email_signup',
        provider: 'github-sso',
        email: 'verified@example.com',
        tenantScoped: true,
        expiresAt: '2026-07-30T12:00:00.000Z'
      },
      false,
      {
        enablePublicSignup: false
      }
    )

    expect(component.verifiedEmailSignup).toBe(true)
    expect(router.navigate).not.toHaveBeenCalledWith(['/auth/login'])
  })
})
