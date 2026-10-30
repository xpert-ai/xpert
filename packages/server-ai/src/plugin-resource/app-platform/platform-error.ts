import { BadRequestException, HttpException } from '@nestjs/common'
import { t } from 'i18next'

export const platformFailureCodes = [
  'application_user_required', 'application_organization_required', 'application_organization_denied',
  'app_platform_not_configured', 'application_trial_unavailable', 'application_dependency_not_ready',
  'application_primary_model_unavailable', 'application_installation_not_ready', 'application_entry_missing',
  'application_preparation_failed', 'application_preparation_incomplete', 'application_binding_not_ready',
  'application_resource_not_exported', 'application_resource_binding_unsupported', 'application_user_unavailable',
  'application_maintenance_actor_invalid', 'application_model_binding_unavailable', 'invalid_application_retry',
  'application_update_conflict', 'application_update_forbidden', 'application_tool_binding_unavailable',
  'application_project_limit', 'application_upload_limit', 'application_concurrency_limit',
  'application_storage_limit', 'application_storage_scope_invalid',
  'application_temporary_storage_limit',
  'application_resource_migration_required', 'application_cost_unavailable', 'application_cost_replayed', 'application_credit_limit'
] as const
export type PlatformFailureCode = (typeof platformFailureCodes)[number]
const runtimeFailureCodes: readonly PlatformFailureCode[] = [
  'application_user_unavailable', 'application_trial_unavailable', 'application_credit_limit',
  'application_concurrency_limit', 'application_project_limit', 'application_upload_limit',
  'application_storage_limit', 'application_storage_scope_invalid',
  'application_temporary_storage_limit',
  'application_cost_unavailable', 'application_primary_model_unavailable',
  'application_model_binding_unavailable', 'application_tool_binding_unavailable'
]
const persistedFailurePrefix = 'APP_PLATFORM_FAILURE:'

export function platformFailure(code: PlatformFailureCode, status = 400) {
  const failure = new HttpException({ code, message: t(`server-ai:Error.${code}`) }, status)
  // Execution records currently persist Error.message. Keep a bounded discriminator
  // there while the ordinary HTTP response retains its localized business message.
  failure.message = `${persistedFailurePrefix}${code}`
  return failure
}

/** Only explicit host error codes may become user-facing execution diagnostics. */
export function publicAppPlatformRuntimeError(value: unknown): string | null {
  let code: string | undefined
  if (typeof value === 'string' && value.startsWith(persistedFailurePrefix)) {
    code = value.slice(persistedFailurePrefix.length)
  } else if (value instanceof HttpException) {
    const response = value.getResponse()
    if (response && typeof response === 'object' && 'code' in response && typeof response.code === 'string')
      code = response.code
  }
  const allowed = runtimeFailureCodes.find(candidate => candidate === code)
  return allowed ? t(`server-ai:Error.${allowed}`) : null
}
export function preparationFailureCode(error: unknown): PlatformFailureCode {
  if (error instanceof HttpException) {
    const response = error.getResponse()
    if (response && typeof response === 'object' && 'code' in response && typeof response.code === 'string') {
      const code = platformFailureCodes.find(candidate => candidate === response.code)
      if (code) return code
    }
  }
  return 'application_preparation_failed'
}
export const invalidPlatformRequest = () => new BadRequestException(t('server-ai:Error.invalid_application_retry'))
