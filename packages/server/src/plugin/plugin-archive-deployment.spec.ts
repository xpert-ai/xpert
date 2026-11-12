import { setupPluginManagementTests } from './plugin-management.test-fixture'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import type { PluginInstallInput } from './types'
import { PluginStoreLease } from './installation/plugin-store-lock'
import type { PluginInstallOptions } from './installation/plugin-archive-installation'
import { withOrganizationPluginStoreLock } from './organization-plugin.store'

jest.mock('@xpert-ai/server-config', () => ({ getConfig: jest.fn() }))

const readActualManifest = jest.requireActual<typeof import('./plugin-archive')>('./plugin-archive').readPluginPackageJson

describe('approved archive installation under the store lease', () => {
	const fixture = setupPluginManagementTests()
	const sha256 = 'a'.repeat(64), name = '@xpert-ai/plugin-openrouter', version = '1.0.0'
	let directory: string, packageDir: string, runtimeDir: string
	beforeEach(() => {
		directory = mkdtempSync(join(tmpdir(), 'archive-installation-'))
		packageDir = join(directory, 'incoming')
		runtimeDir = join(directory, 'installed')
		for (const dir of [packageDir, runtimeDir]) {
			mkdirSync(dir)
			writeFileSync(join(dir, 'package.json'), JSON.stringify({ name, version }))
		}
		fixture.readPluginPackageJson.mockImplementation(readActualManifest)
		Object.assign(fixture.pluginInstanceService, { getConfig: jest.fn(() => ({ existingSetting: 'kept' })) })
		fixture.assertPluginSdkCompatibility.mockReturnValue({ level: 'organization', version })
		fixture.loadPlugin.mockResolvedValue({ meta: { name, version, level: 'organization' } })
		fixture.getOrganizationPluginPath.mockImplementation((_organization: string, runtimeName: string) =>
			runtimeName === 'existing-runtime' ? runtimeDir : join(directory, runtimeName.replace(/[\/@]/g, '_')))
	})
	afterEach(() => rmSync(directory, { recursive: true, force: true }))
	function input(): PluginInstallInput {
		return { pluginName: name, source: 'code', sourceConfig: { packageDir, installationMethod: 'archive' } }
	}
	function options(allowReplace = false): PluginInstallOptions {
		return { allowPackageDir: true, archiveDeployment: { sha256, allowReplace } }
	}
	function installed() {
		return { version, source: 'code', pendingRestart: true,
			sourceConfig: { archiveSha256: sha256, runtimeName: 'existing-runtime', immutableRuntime: true } }
	}
	function expectNoInstallation() {
		expect(fixture.loadPlugin).not.toHaveBeenCalled()
		expect(fixture.registerPluginsAsync).not.toHaveBeenCalled()
		expect(fixture.pluginInstanceService.upsert).not.toHaveBeenCalled()
		expect(fixture.pluginInstanceService.detachRuntime).not.toHaveBeenCalled()
		expect(fixture.runtimeControl.recordPluginRuntimeChange).not.toHaveBeenCalled()
	}

	it('reuses the exact installed archive without claiming that it has loaded or converged', async () => {
		fixture.pluginInstanceService.findOneByPluginName.mockResolvedValue(installed())
		const result = await fixture.service.installPlugin(input(), options())
		expect(result).toMatchObject({ success: true, currentVersion: version, restartRequired: true,
			runtimeRequirements: [{ pluginName: name, scopeKey: 'org-1', version, runtimeRevision: 'runtime:existing-runtime', state: 'loaded' }] })
		expect(result).not.toHaveProperty('runtimeConvergence')
		expect(result).not.toHaveProperty('loaded')
		expectNoInstallation()
	})

	it.each(['digest', 'version', 'source'] as const)('rejects an unauthorized replacement with a different %s', async kind => {
		const row = installed()
		if (kind === 'digest') row.sourceConfig.archiveSha256 = 'b'.repeat(64)
		if (kind === 'version') row.version = '2.0.0'
		if (kind === 'source') row.source = 'npm'
		fixture.pluginInstanceService.findOneByPluginName.mockResolvedValue(row)
		await expect(fixture.service.installPlugin(input(), options())).rejects.toMatchObject({ status: 400 })
		expectNoInstallation()
	})

	it('allows an explicitly authorized replacement and persists only host provenance', async () => {
		fixture.pluginInstanceService.findOneByPluginName.mockResolvedValue({ ...installed(), sourceConfig: { archiveSha256: 'b'.repeat(64) } })
		await fixture.service.installPlugin(input(), options(true))
		expect(fixture.loadPlugin).toHaveBeenCalled()
		expect(fixture.pluginInstanceService.upsert).toHaveBeenCalledWith(expect.objectContaining({
			source: 'code', sourceConfig: expect.objectContaining({ archiveSha256: sha256, immutableRuntime: true })
		}), expect.objectContaining({ publicationLease: expect.anything() }))
	})

	it('persists the verified digest on the first installation and removes temporary packageDir', async () => {
		await fixture.service.installPlugin(input(), options())
		const persisted = fixture.pluginInstanceService.upsert.mock.calls.at(-1)[0]
		expect(persisted.sourceConfig.archiveSha256).toBe(sha256)
		expect(persisted.sourceConfig).not.toHaveProperty('packageDir')
		expect(persisted.sourceConfig.runtimeName).not.toBe('existing-runtime')
	})

	it.each(['missing', 'invalid', 'wrong-name', 'wrong-version', 'mutable'] as const)(
		'repairs the same approved archive instead of reusing a %s package directory', async kind => {
			const row = installed()
			if (kind === 'missing') rmSync(runtimeDir, { recursive: true, force: true })
			if (kind === 'invalid') writeFileSync(join(runtimeDir, 'package.json'), '{')
			if (kind === 'wrong-name') writeFileSync(join(runtimeDir, 'package.json'), JSON.stringify({ name: '@fixture/other', version }))
			if (kind === 'wrong-version') writeFileSync(join(runtimeDir, 'package.json'), JSON.stringify({ name, version: '2.0.0' }))
			if (kind === 'mutable') row.sourceConfig.immutableRuntime = false
			fixture.pluginInstanceService.findOneByPluginName.mockResolvedValue(row)
			await fixture.service.installPlugin(input(), options())
			expect(fixture.loadPlugin).toHaveBeenCalled()
			expect(fixture.pluginInstanceService.upsert).toHaveBeenCalledWith(
				expect.objectContaining({ config: { existingSetting: 'kept' } }), expect.anything())
		})

	it('strips client-supplied provenance without modifying the request object', async () => {
		const body = input()
		body.sourceConfig.archiveSha256 = 'client-spoofed-digest'
		await fixture.service.installPlugin(body, { allowPackageDir: true })
		expect(body.sourceConfig.archiveSha256).toBe('client-spoofed-digest')
		expect(JSON.stringify(fixture.pluginInstanceService.upsert.mock.calls)).not.toContain('client-spoofed-digest')
	})

	it.each(['source', 'directory', 'permission', 'workspace', 'config', 'digest'] as const)(
		'rejects invalid host archive %s options before installation', async kind => {
			const body = input(), opts = options()
			if (kind === 'source') body.source = 'npm'
			if (kind === 'directory') delete body.sourceConfig.packageDir
			if (kind === 'permission') opts.allowPackageDir = false
			if (kind === 'workspace') body.sourceConfig.workspacePath = '/unapproved/source'
			if (kind === 'config') body.config = { credential: 'configuration-must-not-be-silently-skipped' }
			if (kind === 'digest') opts.archiveDeployment.sha256 = 'invalid'
			await expect(fixture.service.installPlugin(body, opts)).rejects.toMatchObject({ status: 400 })
			expectNoInstallation()
		})

	it('makes the replacement decision using the current scoped row while holding the store lease', async () => {
		const lease = new PluginStoreLease(join(directory, 'unused-lock'), 30000)
		jest.spyOn(lease, 'assertOwned').mockResolvedValue(undefined)
		let locked = false
		fixture.pluginInstanceService.findOneByPluginName.mockImplementation(async () => {
			expect(locked).toBe(true)
			return { ...installed(), sourceConfig: { archiveSha256: 'b'.repeat(64) } }
		})
		jest.mocked(withOrganizationPluginStoreLock).mockImplementation(async (_options, action) => {
			locked = true
			try { return await action(lease) } finally { locked = false }
		})
		await expect(fixture.service.installPlugin(input(), options())).rejects.toMatchObject({ status: 400 })
		expect(fixture.pluginInstanceService.findOneByPluginName).toHaveBeenCalledWith(name, 'org-1', 'tenant-1', 'org-1')
		expectNoInstallation()
	})

	it('fails reuse if the store lease has been lost', async () => {
		fixture.pluginInstanceService.findOneByPluginName.mockResolvedValue(installed())
		const lease = new PluginStoreLease(join(directory, 'unused-lock'), 30000)
		jest.spyOn(lease, 'assertOwned').mockRejectedValue(new Error('lease lost'))
		jest.mocked(withOrganizationPluginStoreLock).mockImplementation(async (_options, action) => action(lease))
		await expect(fixture.service.installPlugin(input(), options())).rejects.toMatchObject({ status: 400 })
		expectNoInstallation()
	})

	it.each([false, undefined])('denies restart-required installation without an explicit grant (%s)', async allowRestart => {
		fixture.assertPluginSdkCompatibility.mockReturnValue({ level: 'organization', version,
			runtimePolicy: { install: 'restart', update: 'restart', uninstall: 'restart' } })
		const opts = options()
		opts.archiveDeployment.allowRestart = allowRestart
		await expect(fixture.service.installPlugin(input(), opts)).rejects.toMatchObject({ status: 400 })
		expectNoInstallation()
	})

	it('checks the current runtime restart policy after acquiring the installation lease', async () => {
		jest.mocked(withOrganizationPluginStoreLock).mockImplementation(async (_options, action) => {
			// Another install completed before this operation acquired the lease.
			fixture.loadedPlugins.push({ scopeKey: 'org-1', name, packageName: name,
				instance: { meta: { runtimePolicy: { install: 'hot', update: 'restart', uninstall: 'restart' } } } })
			return action({ assertOwned: async () => undefined } as PluginStoreLease)
		})
		await expect(fixture.service.installPlugin(input(), options())).rejects.toMatchObject({ status: 400 })
		expectNoInstallation()
	})

	it('stages and publishes a restart-required installation only with an explicit grant', async () => {
		const runtimePolicy = { install: 'restart', update: 'restart', uninstall: 'restart' }
		fixture.assertPluginSdkCompatibility.mockReturnValue({ level: 'organization', version, runtimePolicy })
		fixture.assertInstalledPluginSdkCompatibility.mockReturnValue({ level: 'organization', version, runtimePolicy })
		const opts = options()
		opts.archiveDeployment.allowRestart = true
		await fixture.service.installPlugin(input(), opts)
		expect(fixture.registerPluginsAsync).toHaveBeenCalledWith(expect.objectContaining({ stageOnly: true }), expect.anything())
		expect(fixture.pluginInstanceService.upsert).toHaveBeenCalledWith(expect.objectContaining({ pendingRestart: true }), expect.anything())
		expect(fixture.runtimeControl.recordPluginRuntimeChange).toHaveBeenCalled()
		expect(fixture.loadPlugin).not.toHaveBeenCalled()
	})

	it('can reuse a previously installed restart-required archive without scheduling another restart', async () => {
		fixture.pluginInstanceService.findOneByPluginName.mockResolvedValue(installed())
		fixture.assertPluginSdkCompatibility.mockReturnValue({ level: 'organization', version,
			runtimePolicy: { install: 'restart', update: 'restart', uninstall: 'restart' } })
		await expect(fixture.service.installPlugin(input(), options())).resolves.toMatchObject({ success: true, restartRequired: true })
		expectNoInstallation()
	})
})
