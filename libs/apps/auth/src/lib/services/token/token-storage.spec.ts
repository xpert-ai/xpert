/**
 * @license
 * Copyright Akveo. All Rights Reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import { inject, TestBed, waitForAsync } from '@angular/core/testing';
import { PacTokenLocalStorage, PacTokenStorage } from './token-storage';
import { PAC_AUTH_TOKENS } from '../../auth.options';
import { NbAuthSimpleToken, nbAuthCreateToken } from './token';
import { NbAuthJWTToken } from '@nebular/auth/services/token/token';
import { PAC_AUTH_FALLBACK_TOKEN, PacAuthTokenParceler } from './token-parceler';

describe('token-storage', () => {

  let tokenStorage: PacTokenStorage;
  let tokenParceler: PacAuthTokenParceler;
  const testTokenKey = 'auth_app_token';
  const testTokenValue = 'test-token';
  const ownerStrategyName = 'strategy';

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        { provide: PacTokenStorage, useClass: PacTokenLocalStorage },
        { provide: PAC_AUTH_FALLBACK_TOKEN, useValue: NbAuthSimpleToken },
        { provide: PAC_AUTH_TOKENS, useValue: [NbAuthSimpleToken, NbAuthJWTToken] },
        PacAuthTokenParceler,
      ],
    });
  });

    beforeEach(waitForAsync(inject(
    [PacTokenStorage, PacAuthTokenParceler],
    (_tokenStorage, _tokenParceler) => {
      tokenStorage = _tokenStorage;
      tokenParceler = _tokenParceler;
    },
  )));

  afterEach(() => {
    localStorage.removeItem(testTokenKey);
  });

  it('set test token', () => {
    const token = nbAuthCreateToken(NbAuthSimpleToken, testTokenValue, ownerStrategyName);

    tokenStorage.set(token);
    expect(localStorage.getItem(testTokenKey)).toEqual(tokenParceler.wrap(token));
  });

  it('setter set invalid token to localStorage as empty string', () => {
    let token;

    token = nbAuthCreateToken(NbAuthSimpleToken, null, ownerStrategyName);
    tokenStorage.set(token);
    expect(localStorage.getItem(testTokenKey)).toEqual(tokenParceler.wrap(token));

    token = nbAuthCreateToken(NbAuthSimpleToken, undefined, ownerStrategyName);
    tokenStorage.set(token);
    expect(localStorage.getItem(testTokenKey)).toEqual(tokenParceler.wrap(token));
  });

  it('get return null in case token was not set', () => {
    const token = tokenStorage.get();
    expect(token.getValue()).toBe('');
    expect(token.isValid()).toBe(false);
  });

  it('should return correct value', () => {
    const token = nbAuthCreateToken(NbAuthSimpleToken, 'test', ownerStrategyName);
    localStorage.setItem(testTokenKey, tokenParceler.wrap(token));

    expect(tokenStorage.get().getValue()).toEqual(token.getValue());
  });

  it('clear remove token', () => {
    const token = nbAuthCreateToken(NbAuthSimpleToken, 'test', ownerStrategyName);
    localStorage.setItem(testTokenKey, tokenParceler.wrap(token));

    tokenStorage.clear();

    expect(localStorage.getItem(testTokenKey)).toBeNull();
  });

  it('clear remove token only', () => {
    const token = nbAuthCreateToken(NbAuthSimpleToken, 'test', ownerStrategyName);
    localStorage.setItem(testTokenKey, tokenParceler.wrap(token));
    localStorage.setItem(testTokenKey + '2', tokenParceler.wrap(token));

    tokenStorage.clear();

    expect(localStorage.getItem(testTokenKey + '2')).toEqual(tokenParceler.wrap(token));
    expect(localStorage.getItem(testTokenKey)).toBeNull();
  });
});
