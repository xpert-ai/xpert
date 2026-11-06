jest.mock('@xpert-ai/server-config', () => ({ environment: { secretsEncryptionKey: 'configuration-reader-test' } }))
jest.mock('@xpert-ai/plugin-sdk', () => ({ GLOBAL_ORGANIZATION_SCOPE: 'global', SYSTEM_GLOBAL_SCOPE: 'system:global' }))
jest.mock('../plugin-instance.entity', () => ({ PluginInstance: class PluginInstance {} }))

import { Test } from '@nestjs/testing'
import { getRepositoryToken } from '@nestjs/typeorm'
import { IsNull } from 'typeorm'
import { z } from 'zod/v3'
import { serializePluginConfig } from '../plugin-config.crypto'
import { PluginInstance } from '../plugin-instance.entity'
import { PluginConfigurationReader } from './plugin-configuration-reader.service'

type Runtime = Parameters<PluginConfigurationReader['createReader']>[0]
const name = '@xpert-ai/plugin-code-review'
function runtime(overrides: Partial<Runtime> = {}): Runtime {
	return {
		name,
		scopeKey: 'system:global',
		tenantId: null,
		organizationId: 'global',
		source: 'npm',
		instance: {
			meta: {
				name,
				version: '1.0.0',
				category: 'middleware',
				displayName: 'Code Review',
				description: 'Fixture',
				author: 'Test'
			},
			config: { schema: z.object({ githubIntegrationId: z.string().optional() }).strict() }
		},
		ctx: { config: { githubIntegrationId: 'stale-reference' } },
		...overrides
	}
}
function row(overrides: Partial<PluginInstance> = {}): PluginInstance {
	return Object.assign(new PluginInstance(), {
		pluginName: name,
		scopeKey: 'system:global',
		tenantId: null,
		organizationId: null,
		version: '1.0.0',
		source: 'npm',
		config: serializePluginConfig({ githubIntegrationId: 'current-reference' }),
		...overrides
	})
}
function fixture(plugin = runtime()) {
	const state: { row: PluginInstance | null } = { row: row() }
	const repository = { findOne: jest.fn(async () => state.row) }
	const service = new PluginConfigurationReader(repository)
	return { plugin, state, repository, service, read: service.createReader(plugin) }
}

describe('PluginConfigurationReader', () => {
	it('does no idle work and reads the latest committed configuration on every replica', async () => {
		jest.useFakeTimers()
		try {
			const a = fixture(),
				b = fixture()
			b.repository.findOne.mockImplementation(async () => a.state.row)
			await jest.advanceTimersByTimeAsync(60_000)
			expect(a.repository.findOne).not.toHaveBeenCalled()
			expect(b.repository.findOne).not.toHaveBeenCalled()
			expect(jest.getTimerCount()).toBe(0)
			await expect(b.read()).resolves.toEqual({ githubIntegrationId: 'current-reference' })
			a.state.row = row({ config: serializePluginConfig({ githubIntegrationId: 'saved-on-api-a' }) })
			await expect(a.read()).resolves.toEqual({ githubIntegrationId: 'saved-on-api-a' })
			await expect(b.read()).resolves.toEqual({ githubIntegrationId: 'saved-on-api-a' })
			a.state.row = row({ config: {} })
			await expect(b.read()).resolves.toEqual({})
			expect(b.repository.findOne).toHaveBeenCalledTimes(3)
			expect(b.plugin.ctx.config).toEqual({ githubIntegrationId: 'stale-reference' })
		} finally {
			jest.useRealTimers()
		}
	})

	it.each([
		{ scopeKey: 'system:global', tenantId: null, organizationId: 'global' },
		{ scopeKey: 'tenant:t1:global', tenantId: 't1', organizationId: 'global' },
		{ scopeKey: 'o1', tenantId: 't1', organizationId: 'o1' }
	])('captures trusted installation scope independently of mutable context: %j', async (scope) => {
		const f = fixture(runtime(scope))
		const organizationId = scope.organizationId === 'global' ? null : scope.organizationId
		f.state.row = row({ ...scope, organizationId })
		Object.assign(f.plugin, {
			scopeKey: 'foreign',
			tenantId: 'foreign',
			organizationId: 'foreign',
			name: 'foreign'
		})
		await expect(f.read()).resolves.toEqual({ githubIntegrationId: 'current-reference' })
		expect(f.repository.findOne).toHaveBeenCalledWith(
			expect.objectContaining({
				where: {
					scopeKey: scope.scopeKey,
					pluginName: name,
					tenantId: scope.tenantId ?? IsNull(),
					organizationId: organizationId ?? IsNull()
				}
			})
		)
	})

	it.each<Partial<PluginInstance>>([
		{ tenantId: 'foreign' },
		{ organizationId: 'foreign' },
		{ scopeKey: 'foreign' },
		{ pluginName: 'foreign' }
	])('rejects mismatched records even if storage returns one: %j', async (patch) => {
		const f = fixture()
		f.state.row = row(patch)
		await expect(f.read()).rejects.toThrow('plugin_configuration_unavailable')
	})

	it.each<Partial<PluginInstance>>([
		{ version: '2.0.0' },
		{ source: 'code' },
		{ sourceConfig: { runtimeName: 'different-upload' } },
		{ runtimePublication: { publicationId: 'publication', scopeKey: 'system:global', pluginName: name } }
	])('rejects configurations belonging to a staged or different runtime: %j', async (patch) => {
		const f = fixture()
		f.state.row = row(patch)
		await expect(f.read()).rejects.toThrow('plugin_configuration_runtime_mismatch')
	})

	it('accepts the running artifact even if the persisted restart flag survives boot', async () => {
		const f = fixture()
		f.state.row = row({ pendingRestart: true })
		await expect(f.read()).resolves.toEqual({ githubIntegrationId: 'current-reference' })
	})

	it('propagates database failure without falling back to stale configuration and recovers on the next read', async () => {
		const f = fixture()
		f.repository.findOne.mockRejectedValueOnce(new Error('database unavailable'))
		await expect(f.read()).rejects.toThrow('database unavailable')
		await expect(f.read()).resolves.toEqual({ githubIntegrationId: 'current-reference' })
	})

	it.each<Partial<PluginInstance>>([
		{ configurationStatus: 'invalid' },
		{ config: { __xpert_plugin_encrypted__: 'secret-corrupt' } },
		{ config: { privateKey: 'secret-invalid-schema' } }
	])('reports invalid configuration without including secrets: %j', async (patch) => {
		const f = fixture()
		f.state.row = row(patch)
		await expect(f.read()).rejects.toThrow(/^plugin_configuration_invalid$/)
	})

	it('allows an environment-only fallback but fails when an installed plugin is deleted', async () => {
		const env = fixture(runtime({ source: 'env' })),
			installed = fixture()
		env.state.row = null
		installed.state.row = null
		await expect(env.read()).resolves.toEqual({ githubIntegrationId: 'stale-reference' })
		await expect(installed.read()).rejects.toThrow('plugin_configuration_unavailable')
		env.state.row = row({ source: 'env', config: {} })
		await expect(env.read()).resolves.toEqual({})
	})

	it('keeps independent reads isolated when a slower query finishes after a newer one', async () => {
		const f = fixture()
		let complete!: (value: PluginInstance) => void
		f.repository.findOne.mockReturnValueOnce(
			new Promise<PluginInstance>((resolve) => {
				complete = resolve
			})
		)
		const old = f.read()
		f.state.row = row({ config: { githubIntegrationId: 'new' } })
		await expect(f.read()).resolves.toEqual({ githubIntegrationId: 'new' })
		complete(row())
		await old
		await expect(f.read()).resolves.toEqual({ githubIntegrationId: 'new' })
		expect(f.plugin.ctx.config).toEqual({ githubIntegrationId: 'stale-reference' })
	})

	it('resolves its repository through Nest without registering polling lifecycle hooks', async () => {
		const module = await Test.createTestingModule({
			providers: [
				PluginConfigurationReader,
				{ provide: getRepositoryToken(PluginInstance), useValue: { findOne: async () => row() } }
			]
		}).compile()
		await module.init()
		await expect(module.get(PluginConfigurationReader).createReader(runtime())()).resolves.toEqual({
			githubIntegrationId: 'current-reference'
		})
		await module.close()
	})
})
