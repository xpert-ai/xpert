import { mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs'
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
})
