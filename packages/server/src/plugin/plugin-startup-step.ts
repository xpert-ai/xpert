/** Startup timeouts are fatal: a timed-out hook may still mutate the process, so it cannot serve traffic. */
import { Logger } from '@nestjs/common'
import { recordPluginStartupFailure, startPluginStartupStep, finishPluginStartupStep } from './plugin-startup-state'

const logger = new Logger('PluginStartup')
export class PluginStartupTimeoutError extends Error {
	readonly code = 'PLUGIN_STARTUP_TIMEOUT'
}
export async function runPluginStartupStep<T>(
	pluginName: string,
	stage: string,
	action: () => T | Promise<T>,
	timeoutMs = 30_000
): Promise<T> {
	const startedAt = Date.now()
	startPluginStartupStep(pluginName, stage)
	logger.log(JSON.stringify({ event: 'plugin.startup.started', pluginName, stage, timeoutMs }))
	let timer: ReturnType<typeof setTimeout> | undefined
	try {
		const result = await Promise.race([
			Promise.resolve().then(action),
			new Promise<never>((_, reject) => {
				timer = setTimeout(
					() => reject(new PluginStartupTimeoutError(`Plugin ${pluginName} timed out during ${stage}`)),
					timeoutMs
				)
			})
		])
		finishPluginStartupStep(pluginName, stage)
		logger.log(
			JSON.stringify({ event: 'plugin.startup.completed', pluginName, stage, durationMs: Date.now() - startedAt })
		)
		return result
	} catch (error) {
		const failure = {
			pluginName,
			stage,
			durationMs: Date.now() - startedAt,
			code: error instanceof PluginStartupTimeoutError ? error.code : 'PLUGIN_STARTUP_FAILED'
		}
		recordPluginStartupFailure(failure)
		// Do not log plugin configuration or arbitrary exception text which can contain credentials.
		logger.error(JSON.stringify({ event: 'plugin.startup.failed', ...failure }))
		throw error
	} finally {
		if (timer) clearTimeout(timer)
	}
}
