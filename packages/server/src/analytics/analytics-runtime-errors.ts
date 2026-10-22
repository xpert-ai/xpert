import { isSandboxJobRuntimeError } from '@xpert-ai/plugin-sdk'
import { t } from 'i18next'
import { AnalyticsRuntimeError } from './analytics-errors'

// Plugin errors are untrusted. Preserve only known codes and platform-owned copy;
// never forward messages, job IDs, host paths or provider-supplied retry policies.
export function analyticsRuntimeDependencyError(error: unknown): AnalyticsRuntimeError | undefined {
	if (!isSandboxJobRuntimeError(error)) return undefined
	switch (error.code) {
		case 'SANDBOX_RUNTIME_UNAVAILABLE':
			return new AnalyticsRuntimeError({
				code: error.code,
				retryable: false,
				message: t('server-ai:Error.AnalyticsRuntimeUnbound', {
					defaultValue:
						'The required Sandbox Runtime has no compatible binding. Ask an administrator to deploy the matching Runtime Suite binding and API image, then retry.'
				})
			})
		case 'SANDBOX_ACTION_UNAVAILABLE':
		case 'SANDBOX_ACTION_INVALID':
		case 'SANDBOX_PROFILE_UNAVAILABLE':
		case 'SANDBOX_VERSION_MISMATCH':
			return new AnalyticsRuntimeError({
				code: error.code,
				retryable: false,
				message: t('server-ai:Error.AnalyticsRuntimeDependencyInvalid', {
					defaultValue:
						'A required Sandbox Action or Runtime definition is unavailable or incompatible. Ask an administrator to verify the installed plugin and Runtime Suite contracts before retrying.'
				})
			})
		case 'EXPORT_INPUT_INVALID':
			return new AnalyticsRuntimeError({
				code: error.code,
				retryable: false,
				message: t('server-ai:Error.AnalyticsRuntimeInputInvalid', {
					defaultValue:
						'Sandbox Action input or script is invalid. Read the installed runtime skill and correct the script before retrying. Workspace scripts must use query(ctx), declared input aliases and standard libraries; third-party packages such as pandas are not installed.'
				})
			})
		case 'SANDBOX_START_FAILED':
		case 'SANDBOX_CAPACITY_UNAVAILABLE':
			return new AnalyticsRuntimeError({
				code: error.code,
				retryable: true,
				message: t('server-ai:Error.AnalyticsRuntimeTemporarilyUnavailable', {
					defaultValue:
						'The Sandbox Runtime cannot start or has no available capacity. Retry later; if the problem persists, ask an administrator to check Runtime Provider health and capacity.'
				})
			})
		default:
			return undefined
	}
}
