import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { InstanceRegistryService } from '../managed-connection'
import { PluginRuntimeStateService } from './plugin-runtime-state.service'
import type { LoadedPluginRecord } from './types'

describe('PluginRuntimeStateService', () => {
	it('reports the staged source fingerprint for same-version workspace plugins', async () => {
		const baseDir = mkdtempSync(join(tmpdir(), 'xpert-plugin-runtime-state-'))
		try {
			writeFileSync(
				join(baseDir, '.xpert-workspace-stage.json'),
				JSON.stringify({
					schemaVersion: 1,
					packageName: '@xpert-ai/plugin-demo',
					workspacePath: '/workspace/plugin-demo',
					sourceFingerprint: 'source-fingerprint',
					runtimeDependenciesFingerprint: 'dependencies-fingerprint',
					relativeDistPath: null
				})
			)
			const reportPluginState = jest.fn()
			const registry = { reportPluginState } as unknown as InstanceRegistryService
			const loadedPlugins: LoadedPluginRecord[] = [
				{
					organizationId: 'org-1',
					scopeKey: 'org-1',
					name: '@xpert-ai/plugin-demo',
					packageName: '@xpert-ai/plugin-demo',
					source: 'code',
					sourceConfig: { workspacePath: '/workspace/plugin-demo' },
					baseDir,
					instance: { meta: { version: '1.0.0' } },
					ctx: {}
				}
			]

			await new PluginRuntimeStateService(loadedPlugins, registry).report()

			expect(reportPluginState).toHaveBeenCalledWith({
				plugins: [
					{
						scopeKey: 'org-1',
						pluginName: '@xpert-ai/plugin-demo',
						packageName: '@xpert-ai/plugin-demo',
						version: '1.0.0',
						runtimeRevision: 'workspace:source-fingerprint'
					}
				],
				failures: []
			})
		} finally {
			rmSync(baseDir, { recursive: true, force: true })
		}
	})
})
