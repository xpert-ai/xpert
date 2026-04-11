import { Injectable } from '@angular/core';
import { PacAuthToken } from './token';
import { PacAuthTokenParceler } from './token-parceler';

export abstract class PacTokenStorage {

  abstract get(): PacAuthToken;
  abstract set(token: PacAuthToken);
  abstract clear();
}

/**
 * Service that uses browser localStorage as a storage.
 *
 * The token storage is provided into auth module the following way:
 * ```ts
 * { provide: PacTokenStorage, useClass: PacTokenLocalStorage },
 * ```
 *
 * If you need to change the storage behaviour or provide your own - just extend your class from basic `PacTokenStorage`
 * or `PacTokenLocalStorage` and provide in your `app.module`:
 * ```ts
 * { provide: PacTokenStorage, useClass: NbTokenCustomStorage },
 * ```
 *
 */
@Injectable()
export class PacTokenLocalStorage extends PacTokenStorage {

  protected key = 'auth_app_token';

  constructor(private parceler: PacAuthTokenParceler) {
    super();
  }

  /**
   * Returns token from localStorage
   * @returns {PacAuthToken}
   */
  get(): PacAuthToken {
    const raw = localStorage.getItem(this.key);
    return this.parceler.unwrap(raw);
  }

  /**
   * Sets token to localStorage
   * @param {PacAuthToken} token
   */
  set(token: PacAuthToken) {
    const raw = this.parceler.wrap(token);
    localStorage.setItem(this.key, raw);
  }

  /**
   * Clears token from localStorage
   */
  clear() {
    localStorage.removeItem(this.key);
  }
}
