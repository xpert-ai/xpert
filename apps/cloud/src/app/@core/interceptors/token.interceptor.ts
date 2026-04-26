import { HttpEvent, HttpHandler, HttpInterceptor, HttpRequest } from '@angular/common/http'
import { Injectable } from '@angular/core'
import { BehaviorSubject, catchError, filter, firstValueFrom, Observable, switchMap, take, throwError } from 'rxjs'
import { AuthStrategy } from '../auth'
import { Store } from '../services/store.service'

const ANONYMOUS_AUTH_PATHS = new Set([
  '/api/auth/sso/providers',
  '/api/auth/sso/bind/challenge',
  '/api/auth/sso/bind/complete',
  '/api/auth/sso/bind/register',
  '/api/tenant/onboard'
])

@Injectable()
export class TokenInterceptor implements HttpInterceptor {
  private refreshTokenInProgress = false
  private refreshTokenSubject: BehaviorSubject<any> = new BehaviorSubject<any>(null)

  constructor(private store: Store, private auth: AuthStrategy) {}

  intercept(request: HttpRequest<any>, next: HttpHandler): Observable<HttpEvent<any>> {
    const anonymousAuthRequest = isAnonymousAuthRequest(request.url)

    return next.handle(this.addAuthenticationToken(request)).pipe(
      catchError((response) => {
        if (anonymousAuthRequest) {
          return throwError(() => response)
        }

        // We don't want to refresh token for some requests like login or refresh token itself
        // So we verify url and we throw an error if it's the case
        if (request.url.includes('auth/refresh') || request.url.includes('login')) {
          return throwError(() => {
            // We do another check to see if refresh token failed
            // In this case we want to logout user and to redirect it to login page

            if (request.url.includes('auth/refresh')) {
              this.auth.logout().subscribe()
            }

            return response
          })
        }

        // If error status is different than 401 we want to skip refresh token
        // So we check that and throw the error if it's the case
        if (response.status !== 401) {
          return throwError(() => response)
        }

        if (this.refreshTokenInProgress) {
          // If refreshTokenInProgress is true, we will wait until refreshTokenSubject has a non-null value
          // – which means the new token is ready and we can retry the request again
          return this.refreshTokenSubject.pipe(
            filter((result) => result !== null),
            take(1),
            switchMap(() => next.handle(this.addAuthenticationToken(request)))
          )
        } else {
          this.refreshTokenInProgress = true
          // Set the refreshTokenSubject to null so that subsequent API calls will wait until the new token has been retrieved
          this.refreshTokenSubject.next(null)
          // Call auth.refreshAccessToken(this is an Observable that will be returned)

          return this.auth.refreshToken().pipe(
            switchMap((result) => {
              //When the call to refreshToken completes we reset the refreshTokenInProgress to false
              // for the next time the token needs to be refreshed
              this.refreshTokenInProgress = false
              this.refreshTokenSubject.next(result)
              return next.handle(this.addAuthenticationToken(request))
            }),
            catchError((response) => {
              this.refreshTokenInProgress = false
              if (response.status !== 401) {
                return throwError(() => response)
              }

              return this.auth.logout().pipe(
                switchMap(() => throwError(() => response))
              )
            })
          )
        }
      })
    )
  }

  addAuthenticationToken(request) {
    if (isAnonymousAuthRequest(request.url)) {
      return request
    }

    let token: string
    // Get access token from Local Storage
    if (request.url.includes('auth/refresh')) {
      // refreshToken for refresh api
      token = this.store.refreshToken
    } else {
      // accessToken for others
      token = this.store.token
    }

    // If access token is null this means that user is not logged in
    // And we return the original request
    if (!token) {
      return request
    }

    // We clone the request, because the original request is immutable
    return request.clone({
      setHeaders: {
        Authorization: `Bearer ${token}`
      }
    })
  }
}

function isAnonymousAuthRequest(url: string): boolean {
  try {
    return ANONYMOUS_AUTH_PATHS.has(new URL(url, 'http://localhost').pathname)
  } catch {
    return false
  }
}
