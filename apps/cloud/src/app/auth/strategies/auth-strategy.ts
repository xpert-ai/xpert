import { HttpResponse } from '@angular/common/http'
import { Observable } from 'rxjs'
import { XpAuthResult } from '../services/auth-result'
import { XpAuthStrategyOptions } from './auth-strategy-options'
import { deepExtend, getDeepFromObject } from '../helpers'
import { XpAuthToken, xpAuthCreateToken, NbAuthIllegalTokenError } from '../services/token/token'

export abstract class XpAuthStrategy {
  protected defaultOptions: XpAuthStrategyOptions
  protected options: XpAuthStrategyOptions

  // we should keep this any and validation should be done in `register` method instead
  // otherwise it won't be possible to pass an empty object
  setOptions(options: any): void {
    this.options = deepExtend({}, this.defaultOptions, options)
  }

  getOption(key: string): any {
    return getDeepFromObject(this.options, key, null)
  }

  createToken<T extends XpAuthToken>(value: any, failWhenInvalidToken?: boolean): T {
    const token = xpAuthCreateToken<T>(this.getOption('token.class'), value, this.getName())
    // At this point, nbAuthCreateToken failed with NbAuthIllegalTokenError which MUST be intercepted by strategies
    // Or token is created. It MAY be created even if backend did not return any token, in this case it is !Valid
    if (failWhenInvalidToken && !token.isValid()) {
      // If we require a valid token (i.e. isValid), then we MUST throw NbAuthIllegalTokenError so that the strategies
      // intercept it
      throw new NbAuthIllegalTokenError('Token is empty or invalid.')
    }
    return token
  }

  getName(): string {
    return this.getOption('name')
  }

  abstract authenticate(data?: any): Observable<XpAuthResult>

  abstract register(data?: any): Observable<XpAuthResult>

  abstract requestPassword(data?: any): Observable<XpAuthResult>

  abstract resetPassword(data?: any): Observable<XpAuthResult>

  abstract logout(): Observable<XpAuthResult>

  abstract refreshToken(data?: any): Observable<XpAuthResult>

  protected createFailResponse(data?: any): HttpResponse<Object> {
    return new HttpResponse<Object>({ body: {}, status: 401 })
  }

  protected createSuccessResponse(data?: any): HttpResponse<Object> {
    return new HttpResponse<Object>({ body: {}, status: 200 })
  }

  protected getActionEndpoint(action: string): string {
    const actionEndpoint: string = this.getOption(`${action}.endpoint`)
    const baseEndpoint: string = this.getOption('baseEndpoint')
    return actionEndpoint ? baseEndpoint + actionEndpoint : ''
  }
}
