import { mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { PluginStartupState, PluginStartupRecoveryRequiredError } from './plugin-startup-state'
import type { OrganizationPluginConfig } from './plugin-instance.loader'
import type { RuntimePluginState } from '../managed-connection/instance-registry.service'

const old: OrganizationPluginConfig[] = [
	{ scopeKey: 'global', plugins: [{ name: 'test-plugin', version: '1' }], configs: { token: 'private-secret' } }
]
const candidate: OrganizationPluginConfig[] = [{ ...old[0], plugins: [{ name: 'test-plugin', version: '2' }] }]
const runtime: RuntimePluginState = {
	reportedAt: '',
	plugins: [{ scopeKey: 'global', pluginName: 'test-plugin', version: '1' }],
	failures: []
}

describe('PluginStartupState', () => {
	let directory: string
	let file: string
	beforeEach(() => {
		directory = mkdtempSync(join(tmpdir(), 'plugin-boot-'))
		file = join(directory, 'boot.json')
	})
	afterEach(() => rmSync(directory, { recursive: true, force: true }))

	it('restores the admitted configuration after a killed candidate, with encrypted private storage', () => {
		const baseline = new PluginStartupState(file)
		baseline.select(old)
		baseline.commit(runtime)
		expect(statSync(file).mode & 0o777).toBe(0o600)
		expect(readFileSync(file, 'utf8')).not.toContain('private-secret')
		const attempt = new PluginStartupState(file)
		expect(attempt.select(candidate)).toEqual(candidate)
		attempt.start('test-plugin', 'onPluginBootstrap')
		const recovery = new PluginStartupState(file)
		expect(recovery.select(candidate)).toEqual(old)
		expect(recovery.failure).toMatchObject({
			pluginName: 'test-plugin',
			stage: 'onPluginBootstrap',
			code: 'PLUGIN_STARTUP_INTERRUPTED'
		})
		expect(recovery.canRestore(runtime)).toBe(true)
		expect(recovery.canRestore({ ...runtime, plugins: [] })).toBe(false)
		expect(recovery.canRestore({ ...runtime, plugins: [{ ...runtime.plugins[0], version: '2' }] })).toBe(false)
		recovery.commit(runtime)
		expect(new PluginStartupState(file).select(candidate)).toEqual(old)
	})

	it('keeps the candidate failure when recovery encounters an already-known optional load failure', () => {
		const baseline = new PluginStartupState(file)
		baseline.select(old)
		baseline.commit(runtime)
		const attempt = new PluginStartupState(file)
		attempt.select(candidate)
		attempt.fail({
			pluginName: 'test-plugin',
			stage: 'bootstrap',
			code: 'PLUGIN_STARTUP_TIMEOUT',
			durationMs: 30_000
		})
		const recovery = new PluginStartupState(file)
		recovery.select(candidate)
		recovery.fail({ pluginName: 'optional-plugin', stage: 'import', code: 'PLUGIN_STARTUP_FAILED', durationMs: 1 })
		expect(recovery.failure?.pluginName).toBe('test-plugin')
	})

	it('does not resurrect an uninstalled package or its scope when restoring an earlier version', () => {
		const baselineGroups: OrganizationPluginConfig[] = [
			{
				...old[0],
				plugins: [{ name: 'test-plugin@1' }, { name: 'removed-plugin@1' }],
				configs: { 'test-plugin': { setting: 'old' }, 'removed-plugin': { token: 'removed-secret' } }
			},
			{ scopeKey: 'org-b', plugins: [{ name: 'removed-plugin@1' }], configs: {} }
		]
		const baselineRuntime: RuntimePluginState = {
			...runtime,
			plugins: [
				...runtime.plugins,
				{ scopeKey: 'global', pluginName: 'removed-plugin', version: '1' },
				{ scopeKey: 'org-b', pluginName: 'removed-plugin', version: '1' }
			],
			failures: [{ scopeKey: 'global', pluginName: 'removed-plugin', error: 'old failure' }]
		}
		const baseline = new PluginStartupState(file)
		baseline.select(baselineGroups)
		baseline.commit(baselineRuntime)
		const requested = [{ ...baselineGroups[0], plugins: [{ name: 'test-plugin@2' }] }, baselineGroups[1]]
		new PluginStartupState(file).select(requested)
		const recovery = new PluginStartupState(file)
		const restored = recovery.select(requested)
		expect(restored[0].plugins).toEqual([{ name: 'test-plugin@1' }])
		expect(restored[0].configs).toEqual({ 'test-plugin': { setting: 'old' } })
		expect(restored[1]).toEqual(baselineGroups[1])
		const expectedRuntime = { ...runtime, plugins: [runtime.plugins[0], baselineRuntime.plugins[2]] }
		expect(recovery.canRestore(expectedRuntime)).toBe(true)
		expect(recovery.canRestore(baselineRuntime)).toBe(false)
		recovery.commit(expectedRuntime)
		expect(new PluginStartupState(file).select(requested)).toEqual(restored)
	})

	it('removes configuration stored under an uninstalled package runtime name', () => {
		const baselineGroups: OrganizationPluginConfig[] = [
			{
				scopeKey: 'global',
				plugins: [{ name: '@test/retained@1' }, { name: '@test/removed@1' }],
				configs: { retained: { setting: 'old' }, formatter: { token: 'removed-secret' } }
			}
		]
		const retained = { scopeKey: 'global', pluginName: 'retained', packageName: '@test/retained', version: '1' }
		const removed = { scopeKey: 'global', pluginName: 'formatter', packageName: '@test/removed', version: '1' }
		const baseline = new PluginStartupState(file)
		baseline.select(baselineGroups)
		baseline.commit({ ...runtime, plugins: [retained, removed] })
		const requested: OrganizationPluginConfig[] = [
			{
				scopeKey: 'global',
				plugins: [{ name: '@test/retained@2' }],
				configs: { retained: { setting: 'new' } }
			}
		]
		new PluginStartupState(file).select(requested)
		const recovery = new PluginStartupState(file)
		expect(recovery.select(requested)[0].configs).toEqual({ retained: { setting: 'old' } })
		expect(recovery.canRestore({ ...runtime, plugins: [retained] })).toBe(true)
	})

	it('preserves the snapshot when configuration cannot be decrypted during uninstall reconciliation', () => {
		const baseline = new PluginStartupState(file)
		baseline.select(old)
		baseline.commit(runtime)
		const snapshot = JSON.parse(readFileSync(file, 'utf8'))
		snapshot.good[0].configs = { __xpert_plugin_encrypted__: 'invalid-ciphertext' }
		writeFileSync(file, JSON.stringify(snapshot))
		const before = readFileSync(file, 'utf8')
		expect(() => new PluginStartupState(file).select([])).toThrow()
		expect(readFileSync(file, 'utf8')).toBe(before)
	})

	it('keeps built-in runtime entries while dropping a removed installation group', () => {
		const baseline = new PluginStartupState(file)
		baseline.select(old)
		const builtin = { scopeKey: 'system:global', pluginName: 'builtin', version: '1' }
		baseline.commit({ ...runtime, plugins: [...runtime.plugins, builtin] })
		new PluginStartupState(file).select([])
		const recovery = new PluginStartupState(file)
		expect(recovery.select([])).toEqual([])
		expect(recovery.canRestore({ ...runtime, plugins: [builtin] })).toBe(true)
		expect(recovery.canRestore({ ...runtime, plugins: [] })).toBe(false)
	})

	it('allows only one corrected recovery of a legacy snapshot containing removed installations', () => {
		const baseline = new PluginStartupState(file)
		baseline.select(old)
		baseline.commit(runtime)
		const original = JSON.parse(readFileSync(file, 'utf8'))
		new PluginStartupState(file).select([])
		const pending = JSON.parse(readFileSync(file, 'utf8'))
		writeFileSync(
			file,
			JSON.stringify({
				...pending,
				good: original.good,
				goodRuntime: original.goodRuntime,
				recovering: true,
				blocked: pending.attempted
			})
		)
		expect(new PluginStartupState(file).select([])).toEqual([])
		expect(() => new PluginStartupState(file).select([])).toThrow(PluginStartupRecoveryRequiredError)
	})

	it('does not retry a failed recovery indefinitely; an explicit retry re-enables the candidate', () => {
		const baseline = new PluginStartupState(file)
		baseline.select(old)
		baseline.commit(runtime)
		new PluginStartupState(file).select(candidate)
		new PluginStartupState(file).select(candidate)
		expect(() => new PluginStartupState(file).select(candidate)).toThrow(PluginStartupRecoveryRequiredError)
		const retry = new PluginStartupState(file)
		retry.allowRetry()
		expect(retry.select(candidate)).toEqual(candidate)
	})

	it('blocks a repeat failure without a baseline, and accepts a repaired configuration', () => {
		new PluginStartupState(file).select(candidate)
		expect(() => new PluginStartupState(file).select(candidate)).toThrow(PluginStartupRecoveryRequiredError)
		expect(new PluginStartupState(file).select(old)).toEqual(old)
	})

	it('does not bypass a blocked candidate by changing object key order', () => {
		new PluginStartupState(file).select(candidate)
		const reordered = [{ configs: candidate[0].configs, plugins: candidate[0].plugins, scopeKey: 'global' }]
		expect(() => new PluginStartupState(file).select(reordered)).toThrow(PluginStartupRecoveryRequiredError)
	})
	it('persists an isolated failure identity without permitting a later unknown or different-artifact failure', () => {
		const baseline = new PluginStartupState(file)
		baseline.select(old)
		const failure = {
			scopeKey: 'global',
			pluginName: 'optional',
			error: 'provider rejected',
			isolation: { stage: 'provider-preflight' as const, version: '2', runtimeRevision: 'runtime:candidate' }
		}
		const isolated = { ...runtime, failures: [failure] }
		baseline.commit(isolated)
		const restored = new PluginStartupState(file)
		expect(restored.canRestore(isolated)).toBe(true)
		expect(restored.canRestore({ ...runtime, failures: [{ ...failure, isolation: undefined }] })).toBe(false)
		expect(
			restored.canRestore({
				...runtime,
				failures: [
					{
						...failure,
						isolation: {
							...failure.isolation,
							runtimeRevision: 'runtime:other'
						}
					}
				]
			})
		).toBe(false)
	})
})
