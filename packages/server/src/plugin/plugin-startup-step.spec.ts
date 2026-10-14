import { Logger } from '@nestjs/common'
import { runPluginStartupStep, PluginStartupTimeoutError } from './plugin-startup-step'

describe('plugin startup steps', () => {
	afterEach(() => {
		jest.useRealTimers()
		jest.restoreAllMocks()
	})
	it('logs stage and duration without exposing a thrown secret', async () => {
		const log = jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined)
		const error = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined)
		await expect(runPluginStartupStep('test', 'register', () => 42)).resolves.toBe(42)
		expect(log.mock.calls.map(([value]) => JSON.parse(value).event)).toEqual([
			'plugin.startup.started',
			'plugin.startup.completed'
		])
		await expect(
			runPluginStartupStep('test', 'bootstrap', () => {
				throw new Error('secret-password')
			})
		).rejects.toThrow('secret-password')
		expect(error.mock.calls[0][0]).not.toContain('secret-password')
		expect(JSON.parse(error.mock.calls[0][0])).toMatchObject({
			event: 'plugin.startup.failed',
			code: 'PLUGIN_STARTUP_FAILED',
			stage: 'bootstrap'
		})
	})
	it('times out a hanging hook and never advertises a late success', async () => {
		jest.useFakeTimers()
		const log = jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined)
		jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined)
		let finish: () => void = () => undefined
		const promise = runPluginStartupStep(
			'test',
			'bootstrap',
			() =>
				new Promise<void>((resolve) => {
					finish = resolve
				}),
			100
		)
		const rejected = expect(promise).rejects.toBeInstanceOf(PluginStartupTimeoutError)
		await jest.advanceTimersByTimeAsync(100)
		await rejected
		finish()
		await Promise.resolve()
		expect(log.mock.calls.map(([value]) => JSON.parse(value).event)).toEqual(['plugin.startup.started'])
		expect(jest.getTimerCount()).toBe(0)
	})
})
