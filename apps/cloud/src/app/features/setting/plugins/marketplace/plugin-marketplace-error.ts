import { HttpErrorResponse } from '@angular/common/http'
import { PluginMarketplaceDetailErrorCode } from '@xpert-ai/contracts'

export function pluginMarketplaceError(error: unknown) {
  if (error instanceof HttpErrorResponse) {
    // The API code describes lookup outcomes; raw messages may be ambiguous or in another language.
    const body: unknown = error.error
    const code = body && typeof body === 'object' && 'code' in body ? body.code : null
    if (code === PluginMarketplaceDetailErrorCode.LookupFailed) {
      return { messageKey: 'XP.Plugin.DetailSourceUnavailable', retryable: true }
    }
    if (code === PluginMarketplaceDetailErrorCode.Unavailable || error.status === 404) {
      return { messageKey: 'XP.Plugin.DetailUnavailableExplanation', retryable: false }
    }
    if (error.status === 401) {
      return { messageKey: 'XP.Plugin.DetailSignInRequired', retryable: false }
    }
    if (error.status === 403) {
      return { messageKey: 'XP.Plugin.DetailAccessDenied', retryable: false }
    }
  }

  return { messageKey: 'XP.Plugin.DetailLoadFailedExplanation', retryable: true }
}
