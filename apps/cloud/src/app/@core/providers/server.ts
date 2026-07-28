import { InjectionToken } from '@angular/core'

export interface XpServerDefaultOptions {
  modelEnv: 'internal' | 'public'
}

/** Injection token to be used to override the default options for `xp-server`. */
export const XP_SERVER_DEFAULT_OPTIONS = new InjectionToken<XpServerDefaultOptions>('xp-server-default-options', {
  providedIn: 'root',
  factory: XP_SERVER_DEFAULT_OPTIONS_FACTORY
})

/** @docs-private */
export function XP_SERVER_DEFAULT_OPTIONS_FACTORY(): XpServerDefaultOptions {
  return { modelEnv: 'internal' }
}
