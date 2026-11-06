import { Logger } from '@nestjs/common'
import { ResolveLatestPluginVersionQuery } from '../resolve-latest-plugin-version.query'
import { ResolveLatestPluginVersionHandler } from './resolve-latest-plugin-version.handler'

const mockResolveVersion = jest.fn<Promise<string | undefined>, [string]>()
const mockExecFile = jest.fn(
	(
		_command: string,
		_args: string[],
		_options: unknown,
		callback: (error: Error, stdout: string, stderr: string) => void
	) => callback(new Error('Unexpected npm process'), '', '')
)

jest.mock('./npm-plugin-version', () => ({
	NpmPluginVersionClient: jest.fn().mockImplementation(() => ({ resolveLatestVersion: mockResolveVersion }))
}))
jest.mock('node:child_process', () => ({
	execFile: (...args: Parameters<typeof mockExecFile>) => mockExecFile(...args)
}))
jest.mock('@xpert-ai/plugin-sdk', () => ({ getErrorMessage: (error: Error) => error.message }))

describe('ResolveLatestPluginVersionHandler', () => {
	let handler: ResolveLatestPluginVersionHandler
	const query = (name: string) => handler.execute(new ResolveLatestPluginVersionQuery(`@test/${name}`))

	beforeEach(() => {
		mockResolveVersion.mockReset().mockResolvedValue('1.2.3')
		mockExecFile.mockClear()
		jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined)
		handler = new ResolveLatestPluginVersionHandler()
	})

	afterEach(() => jest.restoreAllMocks())

	it('resolves the version through the registry client without starting npm', async () => {
		await expect(query('a')).resolves.toMatchObject({ status: 'success', latestVersion: '1.2.3' })
		expect(mockResolveVersion).toHaveBeenCalledWith('@test/a')
		expect(mockExecFile).not.toHaveBeenCalled()
	})

	it('starts distinct package queries without the proposed two-slot queue', async () => {
		let finish: (version: string) => void = () => undefined
		const pending = new Promise<string>((resolve) => {
			finish = resolve
		})
		mockResolveVersion.mockReturnValue(pending)
		const results = ['a', 'b', 'c', 'd', 'e'].map(query)
		expect(mockResolveVersion).toHaveBeenCalledTimes(5)
		finish('1.2.3')
		await expect(Promise.all(results)).resolves.toEqual(
			Array(5).fill(expect.objectContaining({ status: 'success', latestVersion: '1.2.3' }))
		)
	})

	it('coalesces requests for the same package even after provisional cache expiry', async () => {
		let now = 0
		jest.spyOn(Date, 'now').mockImplementation(() => now)
		let finish: (version: string) => void = () => undefined
		mockResolveVersion.mockReturnValue(
			new Promise((resolve) => {
				finish = resolve
			})
		)
		const first = query('a')
		now = 5 * 60 * 1000 + 1
		const second = query('a')
		expect(mockResolveVersion).toHaveBeenCalledTimes(1)
		finish('1.2.3')
		await expect(Promise.all([first, second])).resolves.toEqual(
			Array(2).fill(expect.objectContaining({ status: 'success', latestVersion: '1.2.3' }))
		)
	})

	it('caches successful results for five minutes from completion', async () => {
		let now = 1000
		jest.spyOn(Date, 'now').mockImplementation(() => now)
		await query('a')
		now += 5 * 60 * 1000 - 1
		await expect(query('a')).resolves.toMatchObject({ status: 'success', latestVersion: '1.2.3' })
		expect(mockResolveVersion).toHaveBeenCalledTimes(1)
		now += 1
		mockResolveVersion.mockResolvedValue('2.0.0')
		await expect(query('a')).resolves.toMatchObject({ status: 'success', latestVersion: '2.0.0' })
		expect(mockResolveVersion).toHaveBeenCalledTimes(2)
	})

	it('preserves failure caching and retries after expiry', async () => {
		let now = 0
		jest.spyOn(Date, 'now').mockImplementation(() => now)
		mockResolveVersion.mockRejectedValue(new Error('Registry unavailable'))
		await expect(query('a')).resolves.toMatchObject({ status: 'failed' })
		await expect(query('a')).resolves.toMatchObject({ status: 'failed' })
		expect(mockResolveVersion).toHaveBeenCalledTimes(1)
		now = 5 * 60 * 1000
		mockResolveVersion.mockResolvedValue('2.0.0')
		await expect(query('a')).resolves.toMatchObject({ status: 'success', latestVersion: '2.0.0' })
	})

	it('preserves the missing-version result', async () => {
		mockResolveVersion.mockResolvedValue(undefined)
		await expect(query('a')).resolves.toMatchObject({ status: 'failed' })
	})
	it('bypasses both successful and failed completed caches on explicit refresh', async () => {
		await query('a')
		mockResolveVersion.mockResolvedValue('2.0.0')
		await expect(handler.execute(new ResolveLatestPluginVersionQuery('@test/a', true))).resolves.toMatchObject({
			status: 'success',
			latestVersion: '2.0.0'
		})
		mockResolveVersion.mockRejectedValue(new Error('secret registry URL'))
		const failed = await handler.execute(new ResolveLatestPluginVersionQuery('@test/a', true))
		expect(failed).toMatchObject({ status: 'failed', errorCode: 'REGISTRY_UNAVAILABLE', latestVersion: '2.0.0' })
		expect(failed.lastSuccessfulCheckAt).toBeDefined()
		expect(JSON.stringify(failed)).not.toContain('secret')
		mockResolveVersion.mockResolvedValue('2.1.0')
		await expect(handler.execute(new ResolveLatestPluginVersionQuery('@test/a', true))).resolves.toMatchObject({
			status: 'success',
			latestVersion: '2.1.0'
		})
		expect(mockResolveVersion).toHaveBeenCalledTimes(4)
	})

	it('coalesces concurrent forced checks', async () => {
		let finish: (version: string) => void = () => undefined
		mockResolveVersion.mockReturnValue(
			new Promise((resolve) => {
				finish = resolve
			})
		)
		const first = handler.execute(new ResolveLatestPluginVersionQuery('@test/a', true))
		const second = handler.execute(new ResolveLatestPluginVersionQuery('@test/a', true))
		expect(mockResolveVersion).toHaveBeenCalledTimes(1)
		finish('2.0.0')
		await expect(first).resolves.toEqual(await second)
	})
})
