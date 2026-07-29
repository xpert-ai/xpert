import { Inject, Injectable, InjectionToken } from '@angular/core'
import { xpAuthCreateToken, XpAuthToken, XpAuthTokenClass } from './token'
import { XP_AUTH_TOKENS } from '../../auth.options'

export interface NbTokenPack {
  name: string
  ownerStrategyName: string
  createdAt: number
  value: string
}

export const XP_AUTH_FALLBACK_TOKEN = new InjectionToken<XpAuthTokenClass>('Xpert Auth Options')

/**
 * Creates a token parcel which could be stored/restored
 */
@Injectable()
export class XpAuthTokenParceler {
  constructor(
    @Inject(XP_AUTH_FALLBACK_TOKEN) private fallbackClass: XpAuthTokenClass,
    @Inject(XP_AUTH_TOKENS) private tokenClasses: XpAuthTokenClass[]
  ) {}

  wrap(token: XpAuthToken): string {
    return JSON.stringify({
      name: token.getName(),
      ownerStrategyName: token.getOwnerStrategyName(),
      createdAt: token.getCreatedAt().getTime(),
      value: token.toString()
    })
  }

  unwrap(value: string): XpAuthToken {
    let tokenClass: XpAuthTokenClass = this.fallbackClass
    let tokenValue = ''
    let tokenOwnerStrategyName = ''
    let tokenCreatedAt: Date = null

    const tokenPack: NbTokenPack = this.parseTokenPack(value)
    if (tokenPack) {
      tokenClass = this.getClassByName(tokenPack.name) || this.fallbackClass
      tokenValue = tokenPack.value
      tokenOwnerStrategyName = tokenPack.ownerStrategyName
      tokenCreatedAt = new Date(Number(tokenPack.createdAt))
    }

    return xpAuthCreateToken(tokenClass, tokenValue, tokenOwnerStrategyName, tokenCreatedAt)
  }

  // TODO: this could be moved to a separate token registry
  protected getClassByName(name): XpAuthTokenClass {
    return this.tokenClasses.find((tokenClass: XpAuthTokenClass) => tokenClass.NAME === name)
  }

  protected parseTokenPack(value): NbTokenPack {
    try {
      return JSON.parse(value)
    } catch (e) {}
    return null
  }
}
