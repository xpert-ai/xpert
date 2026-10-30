import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { setupPluginManagementTests } from './plugin-management.test-fixture'

function barrier() {
	let release: () => void
	const promise = new Promise<void>((resolve) => {
		release = resolve
	})
	return { promise, release: () => release() }
}

describe('Plugin refresh publication', () => {
	const fixture = setupPluginManagementTests()
	const name = '@xpert-ai/plugin-demo'
	const previous = {
		pluginName: name,
		packageName: name,
		version: '1.0.0',
		scopeKey: 'org-1',
		source: 'npm',
		config: {}
	}
	let rows: (typeof previous)[]
	beforeEach(() => {
		rows = [{ ...previous }]
		fixture.pluginInstanceService.findOneByPluginName.mockImplementation(async () => rows[0])
		fixture.pluginInstanceService.uninstallByPackageName.mockImplementation(async () => {
			rows = []
		})
		fixture.pluginInstanceService.upsert.mockImplementation(async (row: typeof previous) => {
			rows = [{ ...row }]
			return row
		})
		fixture.loadPlugin.mockResolvedValue({ meta: { name, version: '2.0.0', level: 'organization' } })
	})

	it('keeps a startup reader on the committed installation while replacement registration is paused', async () => {
		const entered = barrier(),
			resume = barrier()
		fixture.registerPluginsAsync.mockImplementation(async () => {
			entered.release()
			await resume.promise
			return { modules: [], errors: [] }
		})
		const operation = fixture.service.installPlugin({ pluginName: name, version: '2.0.0', source: 'npm' })
		await entered.promise
		const startupSnapshot = rows.map((row) => ({ ...row }))
		resume.release()
		await operation
		expect(startupSnapshot).toEqual([previous])
		expect(rows).toEqual([expect.objectContaining({ version: '2.0.0', scopeKey: 'org-1' })])
	})

	it('keeps the committed version when replacement registration fails', async () => {
		fixture.registerPluginsAsync.mockResolvedValue({ modules: [], errors: [{ error: 'replacement rejected' }] })
		await expect(
			fixture.service.installPlugin({ pluginName: name, version: '2.0.0', source: 'npm' })
		).rejects.toThrow()
		expect(rows).toEqual([previous])
		expect(fixture.pluginInstanceService.removePlugins).not.toHaveBeenCalled()
		expect(fixture.upsertPluginLoadFailure).toHaveBeenCalledWith(
			expect.objectContaining({ pluginName: name, scopeKey: 'org-1' })
		)
		expect(fixture.runtimeState.report).toHaveBeenCalled()
	})

	it('does not delete committed artifacts when runtime publication throws after the database commit', async () => {
		fixture.runtimeControl.recordPluginRuntimeChange.mockRejectedValue(new Error('Redis disconnected'))
		await fixture.service
			.installPlugin({ pluginName: name, version: '2.0.0', source: 'npm' })
			.catch(() => undefined)
		expect(rows).toEqual([expect.objectContaining({ version: '2.0.0', scopeKey: 'org-1' })])
		expect(fixture.pluginInstanceService.removePlugins).not.toHaveBeenCalled()
	})
	it.each(['register-fails', 'commit-reply-lost', 'publish-fails'] as const)(
		'retains old files and handles candidate ownership when %s',
		async (failure) => {
			const directory = mkdtempSync(join(tmpdir(), 'plugin-refresh-files-'))
			const old = join(directory, 'old')
			mkdirSync(old)
			writeFileSync(join(old, 'index.js'), 'old runtime')
			let candidate: string
			fixture.getOrganizationPluginPath.mockImplementation((_org: string, runtimeName: string) =>
				join(directory, runtimeName.replace(/\//g, '_'))
			)
			fixture.registerPluginsAsync.mockImplementation(async (options: { plugins: { runtimeName: string }[] }) => {
				candidate = join(directory, options.plugins[0].runtimeName.replace(/\//g, '_'))
				mkdirSync(candidate, { recursive: true })
				writeFileSync(join(candidate, 'index.js'), 'candidate runtime')
				return { modules: [], errors: failure === 'register-fails' ? [{ error: 'register failed' }] : [] }
			})
			if (failure === 'commit-reply-lost')
				fixture.pluginInstanceService.upsert.mockRejectedValue(new Error('commit reply lost'))
			if (failure === 'publish-fails')
				fixture.runtimeControl.recordPluginRuntimeChange.mockRejectedValue(new Error('publish reply lost'))
			try {
				await fixture.service
					.installPlugin({ pluginName: name, version: '2.0.0', source: 'npm' })
					.catch(() => undefined)
				expect(existsSync(join(old, 'index.js'))).toBe(true)
				expect(existsSync(candidate)).toBe(failure !== 'register-fails')
			} finally {
				rmSync(directory, { recursive: true, force: true })
			}
		}
	)
})
