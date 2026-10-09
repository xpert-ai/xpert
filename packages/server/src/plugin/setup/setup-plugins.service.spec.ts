import { CommandBus } from '@nestjs/cqrs'
import { SetupPluginsService } from './setup-plugins.service'
import { SetupPluginsStore } from './setup-plugins.store'
import { PluginManagementService } from '../plugin-management.service'
import { PluginInstanceService } from '../plugin-instance.service'
import { RuntimeControlService } from '../../runtime-control/runtime-control.service'
import { RequestContext } from '@xpert-ai/plugin-sdk'
import type { SetupPluginProgress, IPluginInstallResult } from '@xpert-ai/contracts'
import { SetupPluginsCatalog } from './setup-plugins.catalog'

jest.mock('./setup-plugins.catalog', () => ({ SetupPluginsCatalog: class {} }))
jest.mock('./setup-plugins.store', () => ({ SetupPluginsStore: class {} }))
jest.mock('../plugin-management.service', () => ({ PluginManagementService: class {} }))
jest.mock('../plugin-instance.service', () => ({ PluginInstanceService: class {} }))
jest.mock('../../runtime-control/runtime-control.service', () => ({ RuntimeControlService: class {} }))
jest.mock('@xpert-ai/plugin-sdk', () => ({
	GLOBAL_ORGANIZATION_SCOPE: 'global',
	ImportDefaultAgentPluginsCommand: class {},
	RequestContext: {
		currentTenantId: jest.fn(),
		currentApiKey: jest.fn(),
		hasRole: jest.fn(),
		getOrganizationId: jest.fn()
	},
	getErrorMessage: (error: Error) => error.message
}))

describe('SetupPluginsService', () => {
	let service: SetupPluginsService
	let progress: SetupPluginProgress
	let finished: Promise<void>
	let complete: () => void
	const store = { read: jest.fn(), save: jest.fn(), acquire: jest.fn() }
	const plugins = { findLoadedPlugin: jest.fn(), installPlugin: jest.fn() }
	const instances = { getDefaultTenantId: jest.fn() }
	const runtime = {
		restartCapability: jest.fn(),
		requestRestart: jest.fn(),
		restartStatus: jest.fn(),
		pluginConvergenceStatus: jest.fn()
	}
	const catalog = { list: jest.fn(), resolve: jest.fn() }
	const commands = { execute: jest.fn() }
	const available = ['system', 'tenant', 'organization'].map((level, i) => ({
		packageName: `@xpert-ai/test-${i}`,
		title: `Test ${i}`,
		level,
		version: '1.0.0'
	}))
	const choices = available.map((item) => item.packageName)

	beforeEach(() => {
		jest.resetAllMocks()
		commands.execute.mockResolvedValue({ commit: 'abc', items: [{ id: 'documents', status: 'imported' }] })
		progress = { phase: 'idle', items: [], updatedAt: '' }
		finished = new Promise<void>((resolve) => {
			complete = resolve
		})
		store.read.mockImplementation(async () => structuredClone(progress))
		store.save.mockImplementation(async (_tenant: string, value: SetupPluginProgress) => {
			progress = structuredClone(value)
		})
		store.acquire.mockResolvedValue(async () => complete())
		instances.getDefaultTenantId.mockResolvedValue('default')
		jest.mocked(RequestContext.currentTenantId).mockReturnValue('default')
		jest.mocked(RequestContext.hasRole).mockReturnValue(true)
		jest.mocked(RequestContext.getOrganizationId).mockReturnValue('org-1')
		catalog.resolve.mockImplementation(async (names: string[]) =>
			names.map((name) => {
				const item = available.find((item) => item.packageName === name)
				if (!item) throw new Error('Unknown plugin')
				return item
			})
		)
		runtime.restartCapability.mockReturnValue({ allowed: true, mode: 'rolling-self-signal', reason: 'allowed' })
		runtime.requestRestart.mockResolvedValue({ restartId: 'restart-1' })
		plugins.installPlugin.mockImplementation(
			async ({ pluginName }: { pluginName: string }): Promise<IPluginInstallResult> => ({
				success: true,
				name: pluginName,
				packageName: pluginName,
				organizationId: 'global',
				runtimeRequirements: [{ pluginName, scopeKey: 'system', version: '1.0.0', state: 'loaded' }],
				restartRequired: true
			})
		)
		service = new SetupPluginsService(
			store as unknown as SetupPluginsStore,
			plugins as unknown as PluginManagementService,
			instances as unknown as PluginInstanceService,
			runtime as unknown as RuntimeControlService,
			catalog as unknown as SetupPluginsCatalog,
			commands as unknown as CommandBus
		)
	})

	it('continues in order after failure and restarts only after every selected plugin was processed', async () => {
		const events: string[] = []
		plugins.installPlugin.mockImplementation(async ({ pluginName }: { pluginName: string }) => {
			events.push(pluginName)
			expect(runtime.requestRestart).not.toHaveBeenCalled()
			if (pluginName === choices[1]) throw new Error('Download unavailable')
			return { runtimeRequirements: [{ pluginName, scopeKey: 'system', state: 'loaded' }] }
		})
		await service.start(choices)
		await finished
		expect(events).toEqual(choices)
		expect(progress.items.map((item) => item.status)).toEqual(['installed', 'failed', 'installed'])
		expect(progress.items[1].error).toBe('Download unavailable')
		for (const item of available) {
			expect(plugins.installPlugin).toHaveBeenCalledWith(
				{ pluginName: item.packageName, version: item.version, source: 'npm' },
				{ deferActivation: true, requiredLevel: item.level }
			)
		}
		expect(runtime.requestRestart).toHaveBeenCalledTimes(1)
		expect(runtime.requestRestart.mock.calls[0][0].runtimeRequirements).toHaveLength(2)
		expect(progress.restartId).toBe('restart-1')
	})

	it('skips existing plugins and finishes without a restart', async () => {
		plugins.findLoadedPlugin.mockReturnValue({ name: choices[0] })
		await service.start(choices)
		await finished
		expect(plugins.installPlugin).not.toHaveBeenCalled()
		expect(runtime.requestRestart).not.toHaveBeenCalled()
		expect(progress.phase).toBe('completed')
	})

	it('allows skipping the entire final step', async () => {
		await service.start([], false)
		await finished
		expect(progress.phase).toBe('completed')
		expect(commands.execute).not.toHaveBeenCalled()
		expect(runtime.requestRestart).not.toHaveBeenCalled()
	})

	it('uses the existing cluster restart capability without a local supervisor or PM2', async () => {
		const environment = process.env
		process.env = { ...environment, IS_DOCKER: 'true' }
		delete process.env.XPERT_API_SUPERVISED
		delete process.env.pm_id
		try {
			expect((await service.status()).automaticRestart).toBe(true)
			expect((await service.start(choices)).automaticRestart).toBe(true)
			await finished
			expect(progress.phase).toBe('restarting')
			expect(runtime.requestRestart).toHaveBeenCalledTimes(1)
			expect(runtime.restartCapability).toHaveBeenCalled()
		} finally {
			process.env = environment
		}
	})

	it('keeps setup incomplete until the plugin generation has converged across all replicas', async () => {
		runtime.requestRestart.mockResolvedValue({ restartId: 'restart-1', pluginGeneration: 7 })
		await service.start(choices)
		await finished
		expect(progress.generation).toBe(7)
		plugins.findLoadedPlugin.mockReturnValue({ instance: { meta: { version: '1.0.0' } } })
		runtime.pluginConvergenceStatus.mockResolvedValue({
			status: 'in_progress',
			targetReplicaCount: 3,
			completedReplicaCount: 1
		})
		expect((await service.status()).progress.phase).toBe('restarting')
		expect(runtime.pluginConvergenceStatus).toHaveBeenCalledWith(7)
		expect(runtime.restartStatus).not.toHaveBeenCalled()
		runtime.pluginConvergenceStatus.mockResolvedValue({
			status: 'completed',
			targetReplicaCount: 3,
			completedReplicaCount: 3
		})
		expect((await service.status()).progress.phase).toBe('completed')
	})

	it('shows cluster activation failures instead of treating a loaded local replica as complete', async () => {
		progress.phase = 'restarting'
		progress.generation = 7
		plugins.findLoadedPlugin.mockReturnValue({ name: choices[0] })
		runtime.pluginConvergenceStatus.mockResolvedValue({ status: 'failed', error: 'Replica activation failed' })
		expect((await service.status()).progress).toMatchObject({
			phase: 'attention',
			error: 'Replica activation failed'
		})
	})

	it('resumes persisted progress without reinstalling successful or failed items', async () => {
		progress.phase = 'installing'
		progress.items = available.map((choice, index) => ({
			packageName: choice.packageName,
			title: choice.title,
			status: index === 0 ? 'installed' : index === 1 ? 'failed' : 'installing',
			runtimeRequirements: []
		}))
		await service.start(choices)
		await finished
		expect(plugins.installPlugin).toHaveBeenCalledTimes(1)
		expect(plugins.installPlugin.mock.calls[0][0].pluginName).toBe(choices[2])
	})

	it('pins organization scope and rejects resuming in a different organization', async () => {
		progress.phase = 'installing'
		progress.organizationId = 'org-original'
		await expect(service.start(choices)).rejects.toThrow()
		expect(plugins.installPlugin).not.toHaveBeenCalled()
	})

	it('does not run a duplicate batch while another API owns the lock', async () => {
		store.acquire.mockResolvedValue(null)
		await service.start(choices)
		expect(plugins.installPlugin).not.toHaveBeenCalled()
		expect(store.save).not.toHaveBeenCalled()
	})

	it('waits for runtime convergence, not merely an available HTTP server', async () => {
		progress.phase = 'restarting'
		progress.restartId = 'restart-1'
		runtime.restartStatus.mockResolvedValue({ status: 'in_progress' })
		expect((await service.status()).progress.phase).toBe('restarting')
		runtime.restartStatus.mockResolvedValue({ status: 'completed' })
		expect((await service.status()).progress.phase).toBe('completed')
	})

	it('rejects non-default tenants and arbitrary package names before installing', async () => {
		await expect(service.start(['@someone/other'])).rejects.toThrow()
		jest.mocked(RequestContext.currentTenantId).mockReturnValue('other')
		await expect(service.start(choices)).rejects.toThrow()
		expect(plugins.installPlugin).not.toHaveBeenCalled()
	})

	it('rejects non-admin sessions', async () => {
		jest.mocked(RequestContext.hasRole).mockReturnValue(false)
		await expect(service.status()).rejects.toThrow()
	})
	it('imports default resources before the single native restart', async () => {
		commands.execute.mockImplementation(async () => {
			expect(plugins.installPlugin).toHaveBeenCalledTimes(choices.length)
			expect(runtime.requestRestart).not.toHaveBeenCalled()
			return { commit: 'abc', items: [{ id: 'documents', status: 'imported' }] }
		})
		await service.start(choices, true)
		await finished
		expect(commands.execute).toHaveBeenCalledTimes(1)
		expect(progress.defaultAgentPlugins.status).toBe('completed')
		expect(progress.defaultAgentPlugins.result.commit).toBe('abc')
		expect(runtime.requestRestart).toHaveBeenCalledTimes(1)
	})
	it('continues activation when default imports fail and saves a retryable error', async () => {
		commands.execute.mockRejectedValue(new Error('Repository unavailable'))
		await service.start(choices, true)
		await finished
		expect(progress.defaultAgentPlugins).toEqual({ status: 'failed', error: 'Repository unavailable' })
		expect(runtime.requestRestart).toHaveBeenCalledTimes(1)
	})
	it.each(['pending', 'importing'] as const)('resumes %s resource imports from saved intent', async (status) => {
		progress.phase = 'installing'
		progress.defaultAgentPlugins = { status }
		await service.start([], false)
		await finished
		expect(commands.execute).toHaveBeenCalledTimes(1)
		expect(progress.phase).toBe('completed')
	})
	it('does not rerun a completed resource import when resuming setup', async () => {
		progress.phase = 'installing'
		progress.defaultAgentPlugins = { status: 'completed', result: { commit: 'saved', items: [] } }
		await service.start([], true)
		await finished
		expect(commands.execute).not.toHaveBeenCalled()
		expect(progress.defaultAgentPlugins.result.commit).toBe('saved')
	})
})
