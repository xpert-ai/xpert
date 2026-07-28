/**
 * @license
 * Copyright Akveo. All Rights Reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import { inject, TestBed, waitForAsync } from '@angular/core/testing'
import { take } from 'rxjs/operators'
import { XpTokenLocalStorage, XpTokenStorage } from './token-storage'
import { NbAuthSimpleToken, XpAuthToken, nbAuthCreateToken } from './token'
import { NbTokenService } from './token.service'
import { NbAuthJWTToken } from '@nebular/auth/services/token/token'
import { XP_AUTH_FALLBACK_TOKEN, XpAuthTokenParceler } from './token-parceler'
import { XP_AUTH_TOKENS } from '../../auth.options'

const noop = () => {}
const ownerStrategyName = 'strategy'

describe('token-service', () => {
  let tokenService: NbTokenService
  let tokenStorage: XpTokenLocalStorage
  const simpleToken = nbAuthCreateToken(NbAuthSimpleToken, 'test value', ownerStrategyName)
  const emptyToken = nbAuthCreateToken(NbAuthSimpleToken, '', ownerStrategyName)
  const testTokenKey = 'auth_app_token'

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        { provide: XpTokenStorage, useClass: XpTokenLocalStorage },
        { provide: XP_AUTH_FALLBACK_TOKEN, useValue: NbAuthSimpleToken },
        { provide: XP_AUTH_TOKENS, useValue: [NbAuthSimpleToken, NbAuthJWTToken] },
        XpAuthTokenParceler,
        NbTokenService
      ]
    })
  })

  beforeEach(waitForAsync(
    inject([NbTokenService, XpTokenStorage], (_tokenService, _tokenStorage) => {
      tokenService = _tokenService
      tokenStorage = _tokenStorage
    })
  ))

  afterEach(() => {
    localStorage.removeItem(testTokenKey)
  })

  it('set calls storage set', () => {
    const spy = spyOn(tokenStorage, 'set').and.returnValue(null)

    tokenService.set(simpleToken).subscribe(() => {
      expect(spy).toHaveBeenCalled()
    })
  })

  it('get return null in case token was not set', () => {
    const spy = spyOn(tokenStorage, 'get').and.returnValue(emptyToken)

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
    const spy = spyOn(tokenStorage, 'clear').and.returnValue(null)

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
