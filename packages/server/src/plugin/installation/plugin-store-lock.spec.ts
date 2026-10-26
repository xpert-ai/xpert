import { mkdir, mkdtemp, rename, rm, stat, utimes } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { withPluginStoreLock } from './plugin-store-lock'

jest.mock('@xpert-ai/server-config', () => ({ getConfig: () => ({ pluginInstallationOptions: { lockWaitMs: 200 } }) }))

describe('Plugin store lease ownership', () => {
	let root: string
	beforeEach(async () => {
		root = await mkdtemp(join(tmpdir(), 'plugin-lease-'))
	})
	afterEach(async () => {
		await rm(root, { recursive: true, force: true })
	})
	it('rejects a competing writer without entering its mutation', async () => {
		let finish: () => void
		let entered: () => void
		const ready = new Promise<void>((resolve) => {
			entered = resolve
		})
		const first = withPluginStoreLock(root, async () => {
			entered()
			await new Promise<void>((resolve) => {
				finish = resolve
			})
		})
		await ready
		const mutate = jest.fn()
		try {
			await expect(withPluginStoreLock(root, mutate)).rejects.toMatchObject({ code: 'ELOCKED' })
			expect(mutate).not.toHaveBeenCalled()
		} finally {
			finish()
			await first
		}
	})
	it('aborts a displaced owner and never removes the replacement lock', async () => {
		const lock = join(root, '.registry-install.lock')
		await expect(
			withPluginStoreLock(root, async (lease) => {
				await rename(lock, join(root, 'old-lock'))
				await mkdir(lock)
				await expect(lease.assertOwned()).rejects.toMatchObject({ code: 'ELOCKLOST' })
				expect(lease.controller.signal.aborted).toBe(true)
			})
		).rejects.toMatchObject({ code: 'ELOCKLOST' })
		expect((await stat(lock)).isDirectory()).toBe(true)
	})
	it('recovers a stale lock left by a dead process', async () => {
		const lock = join(root, '.registry-install.lock')
		await mkdir(lock)
		const old = new Date(Date.now() - 180_000)
		await utimes(lock, old, old)
		await expect(
			withPluginStoreLock(root, async (lease) => {
				await lease.assertOwned()
				return 'owned'
			})
		).resolves.toBe('owned')
	})
})
