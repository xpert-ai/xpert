import 'reflect-metadata'
import { Controller, DynamicModule, Get, Injectable, Logger, Module } from '@nestjs/common'
import { DiscoveryModule, NestFactory } from '@nestjs/core'
import i18next from 'i18next'
import { z } from 'zod/v3'
import {
	AgentMiddlewareRegistry,
	AgentMiddlewareStrategy,
	StrategyBus,
	ToolsetRegistry,
	XpertTool,
	XpertToolProvider,
	XpertToolProviderCoordinator,
	XpertToolProviderRegistry,
	type XpertPlugin
} from '@xpert-ai/plugin-sdk'
import { loadPlugin } from './plugin-loader'
import { readWorkspacePluginRuntimeRevision } from './organization-plugin.store'
import { loaded, loadFailures, registerPluginsAsync } from './plugin.helper'
import { PluginRuntimeStateService } from './plugin-runtime-state.service'
import { preflightPluginProviders } from './plugin-provider-preflight'
import type { IRuntimePluginRequirement } from '@xpert-ai/contracts'
import type { RuntimePluginState } from '../managed-connection/instance-registry.service'
import { RuntimePluginAdmission } from '../runtime-control/runtime-plugin-admission'
import { RuntimeLifecycleService } from '../runtime-control/runtime-lifecycle.service'
import { RuntimeDrainMiddleware } from '../runtime-control/runtime-drain.middleware'
import { evaluateRuntimeRequirements } from '../runtime-control/plugin-runtime-requirements'

jest.mock('./organization-plugin.store', () => ({
	getOrganizationManifestPath: () => '/fixture/plugins.json',
	getOrganizationPluginPath: (_scope: string, name: string) => `/fixture/${name}`,
	getOrganizationPluginRoot: () => '/fixture',
	installOrganizationPlugins: jest.fn(),
	readWorkspacePluginRuntimeRevision: jest.fn()
}))
jest.mock('./plugin-loader', () => ({ loadPlugin: jest.fn() }))
jest.mock('./lifecycle', () => ({ createPluginContext: () => ({ config: {} }) }))
jest.mock('../managed-connection', () => ({ InstanceRegistryService: class {} }))
jest.mock('@xpert-ai/server-config', () => ({ getConfig: () => ({}) }))
jest.mock('./plugin-instance.entity', () => ({ resolvePluginLevel: (level: string) => level ?? 'organization' }))

const input = z.object({}).strict()
const output = z.object({ ok: z.boolean() }).strict()
const exposure = {
	requiredContext: ['tenant'],
	visibility: ['model'],
	behavior: { risk: 'read', sideEffect: 'none', idempotency: 'safe' }
} as const
const constructed = jest.fn()
const executionContext = {
	source: 'mcp',
	tenantId: 'tenant',
	organizationId: 'org-a',
	principal: { type: 'user', id: 'user', userId: 'user' },
	executionId: 'execution',
	requestId: 'request',
	host: {}
} as const

function toolProvider(name: string, componentKey: string, tool: string) {
	@XpertToolProvider({ provider: name, componentKey, name })
	class Provider {
		@XpertTool({
			name: tool,
			description: 'Fixture tool',
			inputSchema: input,
			outputSchema: output,
			middleware: false,
			mcp: exposure
		})
		execute() {
			return { ok: true }
		}
	}
	return Provider
}

@Injectable()
class MustNotConstruct {
	constructor() {
		constructed()
	}
}
@Controller('bad-plugin')
class BadController {
	@Get() get() {
		return { wrong: true }
	}
}
@Controller()
class ManagementController {
	@Get('health') health() {
		return { ready: true }
	}
	@Get('plugins') plugins() {
		return { loaded: loaded.map((plugin) => plugin.name), failures: loadFailures }
	}
}

function fixture(name: string, providers: DynamicModule['providers'], rejected = false): XpertPlugin {
	@Module({})
	class PluginModule {}
	return {
		meta: {
			name,
			version: '1.0.0',
			level: 'organization',
			category: 'tools',
			displayName: name,
			description: 'Startup isolation fixture',
			keywords: [],
			author: 'test'
		},
		register: () => ({
			module: PluginModule,
			providers: [...providers, ...(rejected ? [MustNotConstruct] : [])],
			controllers: rejected ? [BadController] : []
		})
	}
}

async function register(fixtures: XpertPlugin[]) {
	jest.mocked(loadPlugin).mockImplementation(async (name) => {
		const plugin = fixtures.find((item) => item.meta.name === name)
		if (!plugin) throw new Error('Fixture missing')
		return plugin
	})
	return registerPluginsAsync(
		{
			organizationId: 'org-a',
			scopeKey: 'org-a',
			plugins: fixtures.map(({ meta }) => ({ name: meta.name, source: 'npm' }))
		},
		new Logger('test')
	)
}

async function api(modules: DynamicModule[], requirements: IRuntimePluginRequirement[] = []) {
	@Module({
		imports: [DiscoveryModule, ...modules],
		controllers: [ManagementController],
		providers: [
			RuntimeLifecycleService,
			StrategyBus,
			XpertToolProviderRegistry,
			XpertToolProviderCoordinator,
			ToolsetRegistry,
			AgentMiddlewareRegistry
		]
	})
	class TestApi {}
	const app = await NestFactory.create(TestApi, { logger: false, abortOnError: false })
	const reportPluginState = jest
		.fn<Promise<void>, [Omit<RuntimePluginState, 'reportedAt'>]>()
		.mockResolvedValue(undefined)
	await new PluginRuntimeStateService(loaded, { reportPluginState } as never).report()
	const runtime: RuntimePluginState = { ...reportPluginState.mock.calls[0][0], reportedAt: '' }
	const lifecycle = app.get(RuntimeLifecycleService)
	const admission = new RuntimePluginAdmission(
		{
			instanceId: 'test',
			bootId: 'test',
			getPluginState: () => runtime,
			getReadyInstances: async () => [],
			isLeaseValid: () => true,
			setReady: async () => undefined
		},
		lifecycle
	)
	const middleware = new RuntimeDrainMiddleware(lifecycle)
	app.use(middleware.use.bind(middleware))
	await app.listen(0, '127.0.0.1')
	await admission.refresh({
		readDesired: async () => ({ generation: 1, status: 'completed', requirements }),
		readRequirements: async () => requirements
	})
	expect(lifecycle.readiness().status).toBe('ready')
	if (requirements.length && runtime.failures.length) {
		expect(evaluateRuntimeRequirements(requirements, runtime).status).toBe('failed')
	}
	return app
}

describe('plugin provider startup admission', () => {
	beforeAll(async () => {
		await i18next.init({ lng: 'en', resources: {}, interpolation: { escapeValue: false } })
	})
	beforeEach(() => {
		loaded.length = 0
		loadFailures.length = 0
		jest.clearAllMocks()
	})

	it('boots HTTP with two plugins sharing a component key and keeps both usable', async () => {
		const result = await register([
			fixture('@test/json', [toolProvider('json_tools', 'tools', 'format_json')]),
			fixture('@test/url', [toolProvider('url_tools', 'tools', 'encode_url')])
		])
		expect(result.errors).toEqual([])
		const app = await api(result.modules)
		try {
			expect((await fetch(`${await app.getUrl()}/health`)).status).toBe(200)
			const registry = app.get(XpertToolProviderRegistry)
			expect(registry.listRegistrations('org-a')).toHaveLength(2)
			const json = await app.get(ToolsetRegistry).get('json_tools', 'org-a').create({ name: 'json' })
			const url = await app.get(ToolsetRegistry).get('url_tools', 'org-a').create({ name: 'url' })
			expect(json.getMcpCapabilityDefinitions().tools.map((tool) => tool.name)).toEqual(['format_json'])
			expect(url.getMcpCapabilityDefinitions().tools.map((tool) => tool.name)).toEqual(['encode_url'])
			expect(await json.getMcpCapabilityDefinitions().tools[0].execute({}, executionContext)).toMatchObject({
				structuredContent: { ok: true }
			})
			expect(await url.getMcpCapabilityDefinitions().tools[0].execute({}, executionContext)).toMatchObject({
				structuredContent: { ok: true }
			})
		} finally {
			await app.close()
		}
	})

	it('rejects a whole conflicting plugin before Nest construction while HTTP and healthy tools remain available', async () => {
		const result = await register([
			fixture('@test/healthy', [toolProvider('healthy', 'tools', 'healthy_tool')]),
			fixture(
				'@test/broken',
				[toolProvider('partial', 'first', 'partial_tool'), toolProvider('healthy', 'second', 'another_tool')],
				true
			)
		])
		expect(result.modules).toHaveLength(1)
		expect(result.errors).toEqual([
			expect.objectContaining({
				pluginName: '@test/broken',
				code: 'plugin-provider-registration-failed',
				error: expect.stringContaining("Provider 'healthy'"),
				isolation: { stage: 'provider-preflight', version: '1.0.0' }
			})
		])
		const app = await api(
			result.modules,
			['@test/healthy', '@test/broken'].map((pluginName) => ({
				scopeKey: 'org-a',
				pluginName,
				version: '1.0.0',
				state: 'loaded'
			}))
		)
		try {
			const origin = await app.getUrl()
			expect((await fetch(`${origin}/health`)).status).toBe(200)
			expect((await fetch(`${origin}/bad-plugin`)).status).toBe(404)
			const catalog = await (await fetch(`${origin}/plugins`)).json()
			expect(catalog.loaded).toEqual(['@test/healthy'])
			expect(catalog.failures[0].pluginName).toBe('@test/broken')
			expect(constructed).not.toHaveBeenCalled()
			expect(app.get(ToolsetRegistry).list('org-a')).toHaveLength(1)
			const healthy = await app.get(ToolsetRegistry).get('healthy', 'org-a').create({ name: 'healthy' })
			expect(await healthy.getMcpCapabilityDefinitions().tools[0].execute({}, executionContext)).toMatchObject({
				structuredContent: { ok: true }
			})
			expect(() => app.get(XpertToolProviderRegistry).get('partial', 'org-a')).toThrow()
			const reportPluginState = jest.fn()
			const state = new PluginRuntimeStateService(loaded, { reportPluginState } as never)
			await state.report()
			expect(reportPluginState).toHaveBeenCalledWith({
				plugins: [expect.objectContaining({ pluginName: '@test/healthy' })],
				failures: [
					expect.objectContaining({
						pluginName: '@test/broken',
						isolation: { stage: 'provider-preflight', version: '1.0.0' }
					})
				]
			})
		} finally {
			await app.close()
		}
	})

	it('records duplicate components within one plugin as failure and permits an explicitly corrected retry', async () => {
		const result = await register([
			fixture(
				'@test/retry',
				[toolProvider('one', 'tools', 'one_tool'), toolProvider('two', 'tools', 'two_tool')],
				true
			)
		])
		expect(result.modules).toEqual([])
		expect(loadFailures).toHaveLength(1)
		expect(constructed).not.toHaveBeenCalled()
		const retried = await register([
			fixture('@test/retry', [
				toolProvider('one', 'tools', 'one_tool'),
				toolProvider('two', 'other-tools', 'two_tool')
			])
		])
		expect(retried.errors).toEqual([])
		expect(loadFailures).toEqual([])
		expect(loaded.map((plugin) => plugin.name)).toEqual(['@test/retry'])
	})

	it('isolates malformed declarations and leaves a healthy sibling available', async () => {
		const result = await register([
			fixture('@test/malformed', [toolProvider('invalid', 'not_valid', 'invalid_tool')], true),
			fixture('@test/sibling', [toolProvider('sibling', 'tools', 'sibling_tool')])
		])
		expect(result.errors[0].pluginName).toBe('@test/malformed')
		expect(result.errors[0].error).toContain('kebab-case')
		expect(loaded.map((plugin) => plugin.name)).toEqual(['@test/sibling'])
		const app = await api(result.modules)
		try {
			expect((await fetch(`${await app.getUrl()}/health`)).status).toBe(200)
			expect(constructed).not.toHaveBeenCalled()
		} finally {
			await app.close()
		}
	})

	it('checks decorator metadata, class/value providers and middleware adapters without invoking a factory', async () => {
		@AgentMiddlewareStrategy('shared_middleware')
		class ExistingMiddleware {}
		@Module({ providers: [ExistingMiddleware] })
		class ExistingModule {}
		const existing = preflightPluginProviders({ module: ExistingModule }, '@test/existing', 'org-a', [])
		const MiddlewareProvider = toolProvider('middleware_tools', 'tools', 'middleware_tool')
		XpertToolProvider({
			provider: 'middleware_tools',
			componentKey: 'tools',
			name: 'middleware',
			middlewares: [
				{
					provider: 'shared_middleware',
					meta: {
						name: 'shared_middleware',
						label: { en_US: 'Shared' },
						configSchema: { type: 'object', properties: {} }
					}
				}
			],
			defaultMiddleware: 'shared_middleware'
		})(MiddlewareProvider)
		XpertTool({
			name: 'middleware_tool',
			description: 'Fixture',
			inputSchema: input,
			outputSchema: output,
			middleware: true,
			mcp: exposure
		})(
			MiddlewareProvider.prototype,
			'execute',
			Object.getOwnPropertyDescriptor(MiddlewareProvider.prototype, 'execute')!
		)
		const factory = jest.fn(() => new MiddlewareProvider())
		@Module({})
		class CandidateModule {}
		expect(() =>
			preflightPluginProviders(
				{ module: CandidateModule, providers: [{ provide: MiddlewareProvider, useFactory: factory }] },
				'@test/candidate',
				'org-a',
				[existing]
			)
		).toThrow(/shared_middleware/)
		expect(factory).not.toHaveBeenCalled()
		const Value = toolProvider('value_provider', 'value', 'value_tool')
		const Alias = toolProvider('class_provider', 'class', 'class_tool')
		const result = await register([
			fixture('@test/custom-providers', [
				{ provide: 'value-token', useValue: new Value() },
				{ provide: 'class-token', useClass: Alias },
				{ provide: 'plain-config', useValue: Object.create(null) }
			])
		])
		const app = await api(result.modules)
		try {
			expect(app.get(XpertToolProviderRegistry).listRegistrations('org-a')).toHaveLength(2)
		} finally {
			await app.close()
		}
	})
	it('does not attest arbitrary plugin.register failures as isolated provider rejections', async () => {
		const broken = fixture('@test/register-error', [])
		broken.register = () => {
			throw new Error('register side effect failed')
		}
		const result = await register([broken])
		expect(result.errors).toHaveLength(1)
		expect(result.errors[0].isolation).toBeUndefined()
		expect(result.modules).toEqual([])
	})
	it.each([
		{ runtimeName: 'candidate', revision: 'runtime:candidate' },
		{ runtimeName: undefined, revision: 'workspace:source-fingerprint' }
	])('records the rejected code artifact revision: $revision', async ({ runtimeName, revision }) => {
		const broken = fixture('@test/code', [
			toolProvider('one', 'tools', 'one_tool'),
			toolProvider('two', 'tools', 'two_tool')
		])
		jest.mocked(loadPlugin).mockResolvedValue(broken)
		jest.mocked(readWorkspacePluginRuntimeRevision).mockReturnValue('workspace:source-fingerprint')
		const result = await registerPluginsAsync(
			{
				organizationId: 'org-a',
				scopeKey: 'org-a',
				plugins: [{ name: broken.meta.name, source: 'code', runtimeName, sourceConfig: { runtimeName } }]
			},
			new Logger('test')
		)
		expect(result.errors).toEqual([
			expect.objectContaining({
				isolation: {
					stage: 'provider-preflight',
					version: '1.0.0',
					runtimeRevision: revision
				}
			})
		])
		expect(result.modules).toEqual([])
	})
})
