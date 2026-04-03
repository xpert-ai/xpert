import { mkdtempSync, realpathSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { PluginSdkValidationError } from './errors'
import {
	assertPluginSdkCompatibility,
	assertPluginSdkInstallCandidate,
	ensureHostPluginSdkLink,
	readInstalledPluginManifest
} from './plugin-sdk-versioning'

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
			const hostSdkDir = dirname(require.resolve('@xpert-ai/plugin-sdk/package.json'))

			expect(linkPath).toBe(join(workspaceDir, 'node_modules', '@xpert-ai', 'plugin-sdk'))
			expect(realpathSync(linkPath as string)).toBe(realpathSync(hostSdkDir))
		} finally {
			rmSync(workspaceDir, { recursive: true, force: true })
		}
	})

	it('falls back to monorepo plugin manifests for code plugins without an installed package.json', () => {
		expect(readInstalledPluginManifest('@xpert-ai/plugin-draft', join(process.cwd(), 'plugins/global/@xpert-ai/plugin-draft')))
			.toMatchObject({
				name: '@xpert-ai/plugin-draft',
				peerDependencies: expect.objectContaining({
					'@xpert-ai/plugin-sdk': '^3.8.0'
				})
			})
	})
})
