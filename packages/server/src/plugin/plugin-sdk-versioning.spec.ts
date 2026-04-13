import { existsSync, mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { PluginSdkValidationError } from './errors'
import {
	assertPluginSdkCompatibility,
	assertPluginSdkInstallCandidate,
	ensureHostContractsLink,
	ensureHostPluginSdkLink,
	readInstalledPluginManifest
} from './plugin-sdk-versioning'

function getExpectedHostSdkDirs() {
	return [
		dirname(require.resolve('@xpert-ai/plugin-sdk/package.json')),
		join(process.cwd(), 'packages', 'plugin-sdk', 'dist'),
		join(process.cwd(), 'packages', 'plugin-sdk')
	]
		.filter((candidate, index, items) => items.indexOf(candidate) === index)
		.filter((candidate) => existsSync(candidate))
		.map((candidate) => realpathSync(candidate))
}

function getExpectedHostContractsDirs() {
	return [join(process.cwd(), 'packages', 'contracts', 'dist'), join(process.cwd(), 'packages', 'contracts')]
		.filter((candidate, index, items) => items.indexOf(candidate) === index)
		.filter((candidate) => existsSync(candidate))
		.map((candidate) => realpathSync(candidate))
}

describe('plugin sdk versioning', () => {
	it('accepts an explicit single-major peer range compatible with the host sdk', () => {
		expect(
			assertPluginSdkCompatibility(
				{
					name: '@xpert-ai/plugin-demo',
					peerDependencies: {
						'@xpert-ai/plugin-sdk': '^3.8.0'
					}
				},
				{
					hostVersion: '3.8.4',
					expectedPackageName: '@xpert-ai/plugin-demo'
				}
			)
		).toEqual({
			hostVersion: '3.8.4',
			peerRange: '^3.8.0'
		})
	})

	it('treats workspace sdk peer ranges as the current host sdk version', () => {
		expect(
			assertPluginSdkCompatibility(
				{
					name: '@xpert-ai/plugin-demo',
					peerDependencies: {
						'@xpert-ai/plugin-sdk': 'workspace:*'
					}
				},
				{
					hostVersion: '3.9.0-beta.0',
					expectedPackageName: '@xpert-ai/plugin-demo'
				}
			)
		).toEqual({
			hostVersion: '3.9.0-beta.0',
			peerRange: '3.9.0-beta.0'
		})
	})

	it('rejects plugins that bundle the sdk in dependencies', () => {
		expect(() =>
			assertPluginSdkCompatibility(
				{
					name: '@xpert-ai/plugin-demo',
					dependencies: {
						'@xpert-ai/plugin-sdk': '^3.8.0'
					},
					peerDependencies: {
						'@xpert-ai/plugin-sdk': '^3.8.0'
					}
				},
				{
					hostVersion: '3.8.4'
				}
			)
		).toThrow(PluginSdkValidationError)
	})

	it('rejects plugins that do not declare the sdk in peerDependencies', () => {
		expect(() =>
			assertPluginSdkCompatibility(
				{
					name: '@xpert-ai/plugin-demo'
				},
				{
					hostVersion: '3.8.4'
				}
			)
		).toThrow(/peerDependencies/)
	})

	it('rejects overly broad peer ranges that span multiple sdk majors', () => {
		expect(() =>
			assertPluginSdkCompatibility(
				{
					name: '@xpert-ai/plugin-demo',
					peerDependencies: {
						'@xpert-ai/plugin-sdk': '*'
					}
				},
				{
					hostVersion: '3.8.4'
				}
			)
		).toThrow(/single-major range/)

		expect(() =>
			assertPluginSdkCompatibility(
				{
					name: '@xpert-ai/plugin-demo',
					peerDependencies: {
						'@xpert-ai/plugin-sdk': '>=3.8.0'
					}
				},
				{
					hostVersion: '3.8.4'
				}
			)
		).toThrow(/single-major range/)
	})

	it('rejects peer ranges that are incompatible with the host sdk version', () => {
		expect(() =>
			assertPluginSdkCompatibility(
				{
					name: '@xpert-ai/plugin-demo',
					peerDependencies: {
						'@xpert-ai/plugin-sdk': '^4.0.0'
					}
				},
				{
					hostVersion: '3.8.4'
				}
			)
		).toThrow(/incompatible/)
	})

	it('skips registry preflight for non-registry install sources', async () => {
		await expect(
			assertPluginSdkInstallCandidate({
				pluginName: 'file:../plugin-demo',
				source: 'local'
			})
		).resolves.toBeUndefined()
	})

	it('links plugin workspaces to the host sdk package', () => {
		const workspaceDir = mkdtempSync(join(tmpdir(), 'xpert-plugin-sdk-'))

		try {
			const linkPath = ensureHostPluginSdkLink(workspaceDir)

			expect(linkPath).toBe(join(workspaceDir, 'node_modules', '@xpert-ai', 'plugin-sdk'))
			expect(getExpectedHostSdkDirs()).toContain(realpathSync(linkPath as string))
		} finally {
			rmSync(workspaceDir, { recursive: true, force: true })
		}
	})

	it('replaces broken sdk symlinks in plugin workspaces', () => {
		const workspaceDir = mkdtempSync(join(tmpdir(), 'xpert-plugin-sdk-broken-'))

		try {
			const linkPath = join(workspaceDir, 'node_modules', '@xpert-ai', 'plugin-sdk')
			const brokenTarget = join(workspaceDir, 'missing-plugin-sdk')

			mkdirSync(dirname(linkPath), { recursive: true })
			symlinkSync(brokenTarget, linkPath, 'junction')

			expect(existsSync(linkPath)).toBe(false)

			ensureHostPluginSdkLink(workspaceDir)

			expect(getExpectedHostSdkDirs()).toContain(realpathSync(linkPath))
		} finally {
			rmSync(workspaceDir, { recursive: true, force: true })
		}
	})

	it('links plugin workspaces to the host contracts package', () => {
		const workspaceDir = mkdtempSync(join(tmpdir(), 'xpert-plugin-contracts-'))

		try {
			const linkPath = ensureHostContractsLink(workspaceDir)

			expect(linkPath).toBe(join(workspaceDir, 'node_modules', '@xpert-ai', 'contracts'))
			expect(getExpectedHostContractsDirs()).toContain(realpathSync(linkPath as string))
		} finally {
			rmSync(workspaceDir, { recursive: true, force: true })
		}
	})

	it('falls back to monorepo plugin manifests for code plugins without an installed package.json', () => {
		expect(readInstalledPluginManifest('@xpert-ai/plugin-draft', join(process.cwd(), 'plugins/global/@xpert-ai/plugin-draft')))
			.toMatchObject({
				name: '@xpert-ai/plugin-draft',
				peerDependencies: expect.objectContaining({
					'@xpert-ai/plugin-sdk': 'workspace:*'
				})
			})
	})

	it('finds monorepo plugin manifests even when the process cwd is inside a package app', () => {
		const originalCwd = process.cwd()

		try {
			process.chdir(join(originalCwd, 'packages', 'analytics'))

			expect(
				readInstalledPluginManifest(
					'@xpert-ai/plugin-trigger-schedule',
					join(originalCwd, 'plugins/global/@xpert-ai/plugin-trigger-schedule')
				)
			).toMatchObject({
				name: '@xpert-ai/plugin-trigger-schedule',
				peerDependencies: expect.objectContaining({
					'@xpert-ai/plugin-sdk': 'workspace:*'
				})
			})
		} finally {
			process.chdir(originalCwd)
		}
	})
})
