import { t } from 'i18next'
import type { PluginLevel, PluginRuntimePolicy } from '@xpert-ai/contracts'

/** Package scope is an authorization boundary; runtime policy is a separate, explicit capability. */
export function parsePluginRuntimePolicy(value: unknown): PluginRuntimePolicy | undefined {
	if (value === undefined) return undefined
	if (typeof value !== 'object' || value === null) throw new Error(t('server:Error.PluginRuntimePolicyInvalid'))
	if (!('install' in value) || !('update' in value) || !('uninstall' in value)) {
		throw new Error(t('server:Error.PluginRuntimePolicyInvalid'))
	}
	const { install, update, uninstall } = value
	if (
		(install !== 'hot' && install !== 'restart') ||
		(update !== 'hot' && update !== 'restart') ||
		(uninstall !== 'hot' && uninstall !== 'restart')
	)
		throw new Error(t('server:Error.PluginRuntimePolicyInvalid'))
	return { install, update, uninstall }
}

export function requiresPluginRestart(
	policy: PluginRuntimePolicy | undefined,
	level: PluginLevel,
	operation: keyof PluginRuntimePolicy
): boolean {
	// Preserve the existing contract for packages that have not declared hot lifecycle support.
	return policy ? policy[operation] === 'restart' : level === 'system' || level === 'tenant'
}
