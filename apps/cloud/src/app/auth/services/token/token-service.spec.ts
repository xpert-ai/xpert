/**
 * @license
 * Copyright Akveo. All Rights Reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import { inject, TestBed, waitForAsync } from '@angular/core/testing'
import { take } from 'rxjs/operators'
import { XpTokenLocalStorage, XpTokenStorage } from './token-storage'
import { NbAuthJWTToken, NbAuthSimpleToken, XpAuthToken, xpAuthCreateToken } from './token'
import { XpAuthTokenService } from './token.service'
import { XP_AUTH_FALLBACK_TOKEN, XpAuthTokenParceler } from './token-parceler'
import { XP_AUTH_TOKENS } from '../../auth.options'

const noop = () => {}
const ownerStrategyName = 'strategy'

describe('token-service', () => {
  let tokenService: XpAuthTokenService
  let tokenStorage: XpTokenLocalStorage
  const simpleToken = xpAuthCreateToken(NbAuthSimpleToken, 'test value', ownerStrategyName)
  const emptyToken = xpAuthCreateToken(NbAuthSimpleToken, '', ownerStrategyName)
  const testTokenKey = 'auth_app_token'

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        { provide: XpTokenStorage, useClass: XpTokenLocalStorage },
        { provide: XP_AUTH_FALLBACK_TOKEN, useValue: NbAuthSimpleToken },
        { provide: XP_AUTH_TOKENS, useValue: [NbAuthSimpleToken, NbAuthJWTToken] },
        XpAuthTokenParceler,
        XpAuthTokenService
      ]
    })
  })

  beforeEach(waitForAsync(
    inject([XpAuthTokenService, XpTokenStorage], (_tokenService, _tokenStorage) => {
      tokenService = _tokenService
      tokenStorage = _tokenStorage
    })
  ))

  afterEach(() => {
    localStorage.removeItem(testTokenKey)
  })

  it('set calls storage set', () => {
    const spy = jest.spyOn(tokenStorage, 'set').mockReturnValue(null)

    tokenService.set(simpleToken).subscribe(() => {
      expect(spy).toHaveBeenCalled()
    })
  })

  it('get return null in case token was not set', () => {
    const spy = jest.spyOn(tokenStorage, 'get').mockReturnValue(emptyToken)

    tokenService.get().subscribe((token: XpAuthToken) => {
      expect(spy).toHaveBeenCalled()
      expect(token.getValue()).toEqual('')
      expect(token.isValid()).toBe(false)
    })
  })

  it('should return correct value', () => {
    tokenService.set(simpleToken).subscribe(noop)

    tokenService.get().subscribe((token: XpAuthToken) => {
      expect(token.getValue()).toEqual(simpleToken.getValue())
    })
  })

  it('clear remove token', () => {
    const spy = jest.spyOn(tokenStorage, 'clear').mockReturnValue(null)

    tokenService.set(simpleToken).subscribe(noop)

    tokenService.clear().subscribe(() => {
      expect(spy).toHaveBeenCalled()
    })
  })

  it('token should be published', (done) => {
    tokenService
      .tokenChange()
      .pipe(take(1))
      .subscribe((token: XpAuthToken) => {
        expect(token.getValue()).toEqual('')
      })
    tokenService.set(simpleToken).subscribe(noop)
    tokenService.tokenChange().subscribe((token: XpAuthToken) => {
      expect(token.getValue()).toEqual(simpleToken.getValue())
      done()
    })
  })

  it('clear should be published', (done) => {
    tokenService
      .tokenChange()
      .pipe(take(1))
      .subscribe((token: XpAuthToken) => {
        expect(token.getValue()).toEqual('')
      })
    tokenService.set(simpleToken).subscribe(noop)
    tokenService
      .tokenChange()
      .pipe(take(1))
      .subscribe((token: XpAuthToken) => {
        expect(token.getValue()).toEqual(simpleToken.getValue())
      })
    tokenService.clear().subscribe(noop)
    tokenService.tokenChange().subscribe((token: XpAuthToken) => {
      expect(token.getValue()).toEqual('')
      done()
    })
  })
})
