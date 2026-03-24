import type { PluginConfigSpec } from '@xpert-ai/plugin-sdk'
import { z } from 'zod'
import { PluginConfigError } from './errors'

export interface PluginConfigInspection<T extends object> {
	config: T
	error?: string
}

export function mergeConfigWithDefaults<T extends object>(
	_pluginName: string,
	input: unknown,
	spec?: PluginConfigSpec<T>
): T {
	const defaults = (spec?.defaults ?? {}) as T
	return { ...(defaults as any), ...(input as any) } as T
}

export function inspectConfig<T extends object>(
	pluginName: string,
	input: unknown,
	spec?: PluginConfigSpec<T>
): PluginConfigInspection<T> {
	const merged = mergeConfigWithDefaults(pluginName, input, spec)
	if (!spec?.schema) {
		return { config: merged }
	}

	const parsed = spec.schema.safeParse(merged)
	if (!parsed.success) {
		return {
			config: merged,
			error: parsed.error.toString()
		}
	}

	return {
		config: parsed.data as T
	}
}

export function buildConfig<T extends object>(pluginName: string, input: unknown, spec?: PluginConfigSpec<T>): T {
	const inspected = inspectConfig(pluginName, input, spec)
	if (inspected.error) {
		throw new PluginConfigError(pluginName, inspected.error)
	}
	return inspected.config
}

export const CommonBooleanFlag = z.coerce.boolean().default(false)
