import { pluginInstallationInfo, pluginUpdateUnavailableReason } from './plugin-installation-info'
import { latestPluginVersionsSchema } from './plugin-version-check.schema'

describe('plugin installation provenance', () => {
	it('recognizes legacy uploads from recorded provenance and strips server paths', () => {
		expect(
			pluginInstallationInfo('code', {
				uploadFileName: 'C:\\private\\plugin.tgz',
				uploadInstalledAt: '2026-11-05T00:00:00Z',
				runtimeName: 'secret-runtime',
				workspacePath: '/private/source'
			})
		).toEqual({ method: 'archive', fileName: 'plugin.tgz', installedAt: '2026-11-05T00:00:00Z' })
	})
	it('distinguishes source workspaces, npm and unknown code installations', () => {
		expect(pluginInstallationInfo('code', { workspacePath: '/private/source' })).toEqual({ method: 'workspace' })
		expect(pluginInstallationInfo('marketplace')).toEqual({ method: 'npm' })
		expect(pluginInstallationInfo('code')).toEqual({ method: 'unknown' })
	})
	it('explains manual uploads without granting npm update capability', () => {
		expect(pluginUpdateUnavailableReason(false, { method: 'archive' }, 'loaded')).toBe('archive')
		expect(pluginUpdateUnavailableReason(false, { method: 'npm' }, 'loaded')).toBe('scope')
		expect(pluginUpdateUnavailableReason(true, { method: 'npm' }, 'pending_restart')).toBe('pending_restart')
	})
})

describe('version check request boundary', () => {
	it('accepts a bounded explicit forced check and rejects mistyped or excessive input', () => {
		expect(latestPluginVersionsSchema.parse({ names: ['@test/plugin'], forceRefresh: true }).forceRefresh).toBe(
			true
		)
		expect(latestPluginVersionsSchema.safeParse({ forceRefresh: 'true' }).success).toBe(false)
		expect(latestPluginVersionsSchema.safeParse({ names: Array(201).fill('@test/plugin') }).success).toBe(false)
		expect(latestPluginVersionsSchema.safeParse({ names: [''] }).success).toBe(false)
	})
})
