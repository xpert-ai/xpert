import { HttpClient } from '@angular/common/http'
import { Injectable, signal } from '@angular/core'
import { ActivatedRoute } from '@angular/router'
import { XpAuthResult, XpAuthStrategy, XpAuthStrategyClass } from '@cloud/app/auth'
import { AuthService } from '@cloud/app/@core/state'
import { IAuthResponse, ITag, ITenant, IUser, IUserLoginInput } from '@xpert-ai/contracts'
import { CookieService } from 'ngx-cookie-service'
import { Observable, firstValueFrom, from, of } from 'rxjs'
import { catchError, map, shareReplay, tap } from 'rxjs/operators'
import { Store } from '../services/store.service'
import { ARTIFACT_SHARE_SESSION_HTTP_OPTIONS, artifactShareSessionUrl } from '../../artifacts/artifact-share-session'

@Injectable()
export class AuthStrategy extends XpAuthStrategy {
  private static config = {
    login: {
      redirect: {
        success: '/',
        failure: null
      },
      defaultErrors: ['Login/Email combination is not correct, please try again.'],
      defaultMessages: ['You have been successfully logged in.']
    },
    register: {
      redirect: {
        success: '/',
        failure: null
      },
      defaultErrors: ['Something went wrong, please try again.'],
      defaultMessages: ['You have been successfully registered.']
    },
    logout: {
      redirect: {
        success: '/',
        failure: null
      },
      defaultErrors: ['Something went wrong, please try again.'],
      defaultMessages: ['You have been successfully logged out.']
    },
    requestPass: {
      redirect: {
        success: '/',
        failure: null
      },
      defaultErrors: ['Email is not correct, please try again.'],
      defaultMessages: ['Reset password instructions have been sent to your email.']
    },
    resetPass: {
      redirect: {
        success: '/',
        failure: null
      },
      resetPasswordTokenKey: 'reset_password_token',
      defaultErrors: ['Something went wrong, please try again.'],
      defaultMessages: ['Your password has been successfully changed.']
    }
  }

  /**
   * Share the refresh token request, avoid duplicate requests.
   */
  readonly refreshTokenReq = signal<Observable<XpAuthResult>>(null)

  constructor(
    private readonly route: ActivatedRoute,
    private authService: AuthService,
    private store: Store,
    private readonly cookieService: CookieService,
    private readonly http: HttpClient
  ) {
    super()
  }

  static setup(options: { name: string }): [XpAuthStrategyClass, any] {
    return [AuthStrategy, options]
  }

  authenticate(args: { userName: string; password: string; rememberMe?: boolean | null }): Observable<XpAuthResult> {
    const { userName, password } = args

    const loginInput: IUserLoginInput = {
      email: userName,
      password
    }

    return this.login(loginInput).pipe(tap(() => this.rememberMe(args)))
  }

  /**
   * Integrate client side remember me feature
   */
  rememberMe(data?: any) {
    const rememberMe = !!data.rememberMe
    if (rememberMe) {
      this.cookieService.set('email', data.userName)
      this.cookieService.set('rememberMe', 'true')
    } else {
      this.cookieService.delete('rememberMe')
      this.cookieService.delete('email')
    }
  }

  register(args: {
    email: string
    fullName: string
    password: string
    confirm: string
    terms: boolean
    tenant: ITenant
    tags: ITag[]
  }): Observable<XpAuthResult> {
    const { email, fullName, password, confirm, tenant, tags } = args

    if (password !== confirm) {
      return of(new XpAuthResult(false, null, null, ["The passwords don't match."]))
    }

    const registerInput = {
      user: {
        firstName: fullName ? fullName.split(' ').slice(0, -1).join(' ') : null,
        lastName: fullName ? fullName.split(' ').slice(-1).join(' ') : null,
        email,
        tenant,
        tags
      },
      password,
      confirmPassword: confirm
    }

    return this.authService.signup(registerInput).pipe(
      // switchMap((res: IUser) => {
      //   const user: IUser = res
      //   if (user) {
      //     const loginInput = {
      //       email,
      //       password
      //     }
      //     return this.login(loginInput)
      //   }
      //   return EMPTY
      // }),
      map(() => new XpAuthResult(true, null, false, [], [])),
      catchError((err) => {
        if (err.status === 409) {
          return of(new XpAuthResult(false, err.error, false, [err.error?.error], []))
        } else if (err.status === 400) {
          return of(new XpAuthResult(false, err.error, false, err.error?.message, []))
        }
        return of(
          new XpAuthResult(false, err, false, AuthStrategy.config.register.defaultErrors, [
            AuthStrategy.config.register.defaultErrors
          ])
        )
      })
    )
  }

  public logout(): Observable<XpAuthResult> {
    return from(this._logout())
  }

  public login(loginInput: IUserLoginInput): Observable<XpAuthResult> {
    return this.authService.login(loginInput).pipe(
      map((res: IAuthResponse) => {
        let user: IUser
        let token: string
        let refreshToken: string
        if (res) {
          user = res.user
          token = res.token
          refreshToken = res.refreshToken
        }

        if (!user) {
          return new XpAuthResult(false, res, false, AuthStrategy.config.login.defaultErrors)
        }

        // 将 User Token RefreshToken 保存至 localStorage
        this.store.userId = user.id
        this.store.token = token
        this.store.refreshToken = refreshToken
        this.store.restoreRememberedScope(user.id)
        this.store.user = user

        return new XpAuthResult(
          true,
          res,
          AuthStrategy.config.login.redirect.success,
          [],
          AuthStrategy.config.login.defaultMessages
        )
      }),
      catchError((err) => {
        console.error(err)
        return of(
          new XpAuthResult(false, err, false, AuthStrategy.config.login.defaultErrors, [
            AuthStrategy.config.login.defaultErrors
          ])
        )
      })
    )
  }

  /**
   * Refresh token
   *
   * Will share the refresh token request, avoid duplicate requests.
   *
   */
  refreshToken(data?: any): Observable<XpAuthResult> {
    if (!this.refreshTokenReq()) {
      this.refreshTokenReq.set(
        this.authService.refreshAccessToken().pipe(
          map((tokens: any) => {
            this.store.token = tokens.token
            this.store.refreshToken = tokens.refreshToken

            return new XpAuthResult(true, tokens, false)
          }),
          tap(() => {
            this.refreshTokenReq.set(null)
          }),
          shareReplay(1)
        )
      )
    }

    return this.refreshTokenReq()
  }

  requestPassword(data?: any): Observable<XpAuthResult> {
    const { email } = data
    return this.authService
      .requestPassword({
        email
      })
      .pipe(
        map((tokens) => {
          return new XpAuthResult(true, tokens, false)
        })
      )
  }

  resetPassword(data?: any): Observable<XpAuthResult> {
    const { password, confirmPassword } = data
    const token = this.route.snapshot.queryParamMap.get('token')

    if (password !== confirmPassword) {
      return of(new XpAuthResult(false, null, null, ['The password and confirmation password do not match.']))
    }

    return this.authService
      .resetPassword({
        token,
        password,
        confirmPassword
      })
      .pipe(
        map((res: any) => {
          if (res.status === 400) {
            throw new Error(res.message)
          }
          return new XpAuthResult(
            true,
            res,
            AuthStrategy.config.resetPass.redirect.success,
            [],
            AuthStrategy.config.resetPass.defaultMessages
          )
        }),
        catchError((err) => {
          return of(
            new XpAuthResult(false, err, false, AuthStrategy.config.resetPass.defaultErrors, [
              AuthStrategy.config.resetPass.defaultErrors
            ])
          )
        })
      )
  }

  private async _logout(): Promise<XpAuthResult> {
    try {
      await firstValueFrom(this.http.delete(artifactShareSessionUrl(), ARTIFACT_SHARE_SESSION_HTTP_OPTIONS))
    } catch {
      // Logout must still clear local authentication if the API is offline.
    }
    this.authService.logout()

    this.store.clear()
    this.store.serverConnection = 200

    // if (this.electronService.isElectronApp) {
    // 	try {
    // 		this.electronService.ipcRenderer.send('logout');
    // 	} catch (error) {}
    // }

    return new XpAuthResult(
      true,
      null,
      AuthStrategy.config.logout.redirect.success,
      [],
      AuthStrategy.config.logout.defaultMessages
    )
  }
}
