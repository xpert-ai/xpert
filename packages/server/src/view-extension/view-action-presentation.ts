import { AIPermissionsEnum, XpertViewActionResult } from '@xpert-ai/contracts'
import { RequestContext } from '@xpert-ai/plugin-sdk'
import { t } from 'i18next'
import { accountStorageFailure, accountStorageLimitMessage } from '../shared/storage-budget-error'

export function presentViewActionResult(result: XpertViewActionResult): XpertViewActionResult {
  if (!result.success && result.message && Object.values(result.message).some(value => value === accountStorageFailure)) {
    const message = accountStorageLimitMessage()
    return { success: false, failure: { kind: 'business', code: 'application_storage_limit' },
      message: { en_US: message, zh_Hans: message }, refresh: false }
  }
  if (RequestContext.hasPermission(AIPermissionsEnum.XPERT_VIEW) || result.success || result.failure?.kind === 'business')
    return result
  const message = t('server-ai:Error.ApplicationRuntimeFailed', {
    defaultValue: 'The task could not be completed. Please try again or contact support.'
  })
  return { success: false, message: { en_US: message, zh_Hans: message }, refresh: false }
}
