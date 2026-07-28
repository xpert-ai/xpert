import { Injectable } from '@angular/core'
import { XpAuthToken } from './token'
import { XpAuthTokenParceler } from './token-parceler'

export abstract class XpTokenStorage {
  abstract get(): XpAuthToken
  abstract set(token: XpAuthToken)
  abstract clear()
}

/**
 * Service that uses browser localStorage as a storage.
 *
 * The token storage is provided into auth module the following way:
 * ```ts
 * { provide: XpTokenStorage, useClass: XpTokenLocalStorage },
 * ```
 *
 * If you need to change the storage behaviour or provide your own - just extend your class from basic `XpTokenStorage`
 * or `XpTokenLocalStorage` and provide in your `app.module`:
 * ```ts
 * { provide: XpTokenStorage, useClass: NbTokenCustomStorage },
 * ```
 *
 */
@Injectable()
export class XpTokenLocalStorage extends XpTokenStorage {
  protected key = 'auth_app_token'

  constructor(private parceler: XpAuthTokenParceler) {
    super()
  }

  /**
   * Returns token from localStorage
   * @returns {XpAuthToken}
   */
  get(): XpAuthToken {
    const raw = localStorage.getItem(this.key)
    return this.parceler.unwrap(raw)
  }

  /**
   * Sets token to localStorage
   * @param {XpAuthToken} token
   */
  set(token: XpAuthToken) {
    const raw = this.parceler.wrap(token)
    localStorage.setItem(this.key, raw)
  }

  /**
   * Clears token from localStorage
   */
  clear() {
    localStorage.removeItem(this.key)
  }
}
