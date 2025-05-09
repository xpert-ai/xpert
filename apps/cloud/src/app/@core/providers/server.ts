import { InjectionToken } from '@angular/core'

export interface PacServerDefaultOptions {
  modelEnv: 'internal' | 'public'
}

/** Injection token to be used to override the default options for `pac-server`. */
export const PAC_SERVER_DEFAULT_OPTIONS = new InjectionToken<PacServerDefaultOptions>(
  'pac-server-default-options',
  {
    providedIn: 'root',
    factory: PAC_SERVER_DEFAULT_OPTIONS_FACTORY
  }
)

/** @docs-private */
export function PAC_SERVER_DEFAULT_OPTIONS_FACTORY(): PacServerDefaultOptions {
  return { modelEnv: 'internal' }
}
