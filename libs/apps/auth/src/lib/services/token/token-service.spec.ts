/**
 * @license
 * Copyright Akveo. All Rights Reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import { inject, TestBed, waitForAsync } from '@angular/core/testing';
import { take } from 'rxjs/operators';
import { PacTokenLocalStorage, PacTokenStorage } from './token-storage';
import { NbAuthSimpleToken, PacAuthToken, nbAuthCreateToken } from './token';
import { NbTokenService } from './token.service';
import { NbAuthJWTToken } from '@nebular/auth/services/token/token';
import { PAC_AUTH_FALLBACK_TOKEN, PacAuthTokenParceler } from './token-parceler';
import { PAC_AUTH_TOKENS } from '../../auth.options';

const noop = () => {};
const ownerStrategyName = 'strategy';

describe('token-service', () => {

  let tokenService: NbTokenService;
  let tokenStorage: PacTokenLocalStorage;
  const simpleToken = nbAuthCreateToken(NbAuthSimpleToken, 'test value', ownerStrategyName);
  const emptyToken = nbAuthCreateToken(NbAuthSimpleToken, '', ownerStrategyName);
  const testTokenKey = 'auth_app_token';

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        { provide: PacTokenStorage, useClass: PacTokenLocalStorage },
        { provide: PAC_AUTH_FALLBACK_TOKEN, useValue: NbAuthSimpleToken },
        { provide: PAC_AUTH_TOKENS, useValue: [NbAuthSimpleToken, NbAuthJWTToken] },
        PacAuthTokenParceler,
        NbTokenService,
      ],
    });
  });

    beforeEach(waitForAsync(inject(
    [NbTokenService, PacTokenStorage],
    (_tokenService, _tokenStorage) => {
      tokenService = _tokenService;
      tokenStorage = _tokenStorage;
    },
  )));

  afterEach(() => {
    localStorage.removeItem(testTokenKey);
  });

  it('set calls storage set', () => {

    const spy = spyOn(tokenStorage, 'set')
      .and
      .returnValue(null);

    tokenService.set(simpleToken).subscribe(() => {
      expect(spy).toHaveBeenCalled();
    });
  });

  it('get return null in case token was not set', () => {

    const spy = spyOn(tokenStorage, 'get')
      .and
      .returnValue(emptyToken);

    tokenService.get()
      .subscribe((token: PacAuthToken) => {
        expect(spy).toHaveBeenCalled();
        expect(token.getValue()).toEqual('');
        expect(token.isValid()).toBe(false);
      })
  });

  it('should return correct value', () => {
    tokenService.set(simpleToken).subscribe(noop);

    tokenService.get()
      .subscribe((token: PacAuthToken) => {
        expect(token.getValue()).toEqual(simpleToken.getValue());
      });
  });

  it('clear remove token', () => {

    const spy = spyOn(tokenStorage, 'clear')
      .and
      .returnValue(null);

    tokenService.set(simpleToken).subscribe(noop);

    tokenService.clear().subscribe(() => {
      expect(spy).toHaveBeenCalled();
    });
  });

  it('token should be published', (done) => {
    tokenService.tokenChange()
      .pipe(take(1))
      .subscribe((token: PacAuthToken) => {
        expect(token.getValue()).toEqual('');
      });
    tokenService.set(simpleToken).subscribe(noop);
    tokenService.tokenChange()
      .subscribe((token: PacAuthToken) => {
        expect(token.getValue()).toEqual(simpleToken.getValue());
        done();
      });
  });

  it('clear should be published', (done) => {
    tokenService.tokenChange()
      .pipe(take(1))
      .subscribe((token: PacAuthToken) => {
        expect(token.getValue()).toEqual('');
      });
    tokenService.set(simpleToken).subscribe(noop);
    tokenService.tokenChange()
      .pipe(take(1))
      .subscribe((token: PacAuthToken) => {
        expect(token.getValue()).toEqual(simpleToken.getValue());
      });
    tokenService.clear().subscribe(noop);
    tokenService.tokenChange()
      .subscribe((token: PacAuthToken) => {
        expect(token.getValue()).toEqual('');
        done();
      });
  })
});
