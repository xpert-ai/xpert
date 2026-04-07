import { Inject, Injectable, InjectionToken } from '@angular/core';
import { pacAuthCreateToken, PacAuthToken, PacAuthTokenClass } from './token';
import { PAC_AUTH_TOKENS } from '../../auth.options';

export interface NbTokenPack {
  name: string,
  ownerStrategyName: string,
  createdAt: number,
  value: string,
}

export const PAC_AUTH_FALLBACK_TOKEN = new InjectionToken<PacAuthTokenClass>('Xpert Auth Options');

/**
 * Creates a token parcel which could be stored/restored
 */
@Injectable()
export class PacAuthTokenParceler {

  constructor(@Inject(PAC_AUTH_FALLBACK_TOKEN) private fallbackClass: PacAuthTokenClass,
              @Inject(PAC_AUTH_TOKENS) private tokenClasses: PacAuthTokenClass[]) {
  }

  wrap(token: PacAuthToken): string {
    return JSON.stringify({
      name: token.getName(),
      ownerStrategyName: token.getOwnerStrategyName(),
      createdAt: token.getCreatedAt().getTime(),
      value: token.toString(),
    });
  }

  unwrap(value: string): PacAuthToken {
    let tokenClass: PacAuthTokenClass = this.fallbackClass;
    let tokenValue = '';
    let tokenOwnerStrategyName = '';
    let tokenCreatedAt: Date = null;

    const tokenPack: NbTokenPack = this.parseTokenPack(value);
    if (tokenPack) {
      tokenClass = this.getClassByName(tokenPack.name) || this.fallbackClass;
      tokenValue = tokenPack.value;
      tokenOwnerStrategyName = tokenPack.ownerStrategyName;
      tokenCreatedAt = new Date(Number(tokenPack.createdAt));
    }

    return pacAuthCreateToken(tokenClass, tokenValue, tokenOwnerStrategyName, tokenCreatedAt);

  }

  // TODO: this could be moved to a separate token registry
  protected getClassByName(name): PacAuthTokenClass {
    return this.tokenClasses.find((tokenClass: PacAuthTokenClass) => tokenClass.NAME === name);
  }

  protected parseTokenPack(value): NbTokenPack {
    try {
      return JSON.parse(value);
    } catch (e) { }
    return null;
  }
}
