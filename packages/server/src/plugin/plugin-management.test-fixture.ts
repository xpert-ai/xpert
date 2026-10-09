import { z } from 'zod'
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Entity } from 'typeorm'
import type { PluginInstanceService } from './plugin-instance.service'
import type { PluginSchemaSyncService } from './plugin-schema-sync.service'
import type { RuntimeControlService } from '../runtime-control/runtime-control.service'

jest.mock('@xpert-ai/contracts', () => ({
	PLUGIN_CONFIGURATION_STATUS: {
		VALID: 'valid',
		INVALID: 'invalid'
	},
	PLUGIN_COMPONENT_TYPE: {
		SKILL: 'skill',
		MCP_SERVER: 'mcp_server',
		APP: 'app',
		HOOK: 'hook',
		ASSET: 'asset'
	},
	PLUGIN_LEVEL: {
		SYSTEM: 'system',
		TENANT: 'tenant',
		ORGANIZATION: 'organization'
	}
}))

jest.mock('@xpert-ai/plugin-sdk', () => ({
	derivePluginArtifactNamespace: jest.fn((packageName: string) =>
		packageName
			.replace(/^@[^/]+\//, '')
			.replace(/^plugin-/, '')
			.replace(/[^a-zA-Z0-9]+/g, '_')
			.replace(/^_+|_+$/g, '')
			.toLowerCase()
	),
	GLOBAL_ORGANIZATION_SCOPE: '__global__',
	SYSTEM_GLOBAL_SCOPE: 'system:global',
	TENANT_GLOBAL_SCOPE_PREFIX: 'tenant:',
	TENANT_GLOBAL_SCOPE_SUFFIX: ':global',
	getTenantGlobalScopeKey: (tenantId: string) => `tenant:${tenantId}:global`,
	isTenantGlobalScopeKey: (value?: string | null) =>
		typeof value === 'string' && value.startsWith('tenant:') && value.endsWith(':global'),
	resolveTenantGlobalScopeKey: jest.fn((tenantId?: string | null) =>
		tenantId && tenantId !== 'default-tenant' ? `tenant:${tenantId}:global` : '__global__'
	),
	RequestContext: {
		getOrganizationId: jest.fn(),
		currentTenantId: jest.fn(),
		getScope: jest.fn()
	},
	STRATEGY_META_KEY: 'strategy-meta',
	PLUGIN_JOB_PROCESSOR_METADATA: 'XPERT_PLUGIN_JOB_PROCESSOR_METADATA',
	StrategyBus: class StrategyBus {},
	getErrorMessage: jest.fn((error: unknown) => (error instanceof Error ? error.message : String(error)))
}))

jest.mock('i18next', () => ({
	t: jest.fn((_: string, options?: Record<string, any>) => options?.errorMessage ?? options?.pluginName ?? '')
}))

jest.mock('./plugin.helper', () => ({
	collectProvidersWithMetadata: jest.fn(() => []),
	clearPluginLoadFailure: jest.fn(),
	getEntitiesFromPlugins: jest.fn(() => []),
	getSubscribersFromPlugins: jest.fn(() => []),
	hasLifecycleMethod: jest.fn(() => false),
	PLUGIN_SYSTEM_LEVEL_INSTALL_FORBIDDEN_CODE: 'plugin-system-level-install-forbidden',
	registerPluginsAsync: jest.fn(async () => ({ modules: [], errors: [] })),
	upsertPluginLoadFailure: jest.fn()
}))

jest.mock('./plugin-loader', () => ({
	loadPlugin: jest.fn()
}))

jest.mock('./plugin-http-routes', () => ({
	registerPluginControllerRoutes: jest.fn(() => ({
		controllerCount: 0,
		moduleCount: 0
	})),
	snapshotHttpRouteStack: jest.fn(() => null),
	snapshotModuleIds: jest.fn(() => new Set())
}))

jest.mock('./plugin-sdk-versioning', () => ({
	assertInstalledPluginSdkCompatibility: jest.fn(() => ({
		hostVersion: '3.8.4',
		peerRange: '^3.8.0',
		warnings: [],
		level: 'organization',
		version: '1.0.0'
	})),
	assertPluginSdkCompatibility: jest.fn(() => ({
		hostVersion: '3.8.4',
		peerRange: '^3.8.0',
		warnings: []
	})),
	assertPluginSdkInstallCandidate: jest.fn(async () => ({
		hostVersion: '3.8.4',
		peerRange: '^3.8.0',
		warnings: []
	}))
}))

jest.mock('./organization-plugin.store', () => ({
	getOrganizationPluginPath: jest.fn((organizationId: string, pluginName: string) => {
		const sanitizedName = pluginName.replace(/[\/@]/g, '__')
		return `/tmp/plugins/${organizationId}/${sanitizedName}`
	}),
	getOrganizationPluginRoot: jest.fn(() => '/tmp/plugins'),
	readWorkspacePluginRuntimeRevision: jest.fn(() => 'workspace:test-source'),
	stagePackageDirectoryPlugin: jest.fn()
}))

jest.mock('./plugin-archive', () => ({
	cleanupExtractedPluginArchive: jest.fn(),
	extractPluginArchive: jest.fn(),
	readPluginPackageJson: jest.fn(() => ({
		name: '@xpert-ai/plugin-uploaded-demo',
		version: '0.2.0',
		peerDependencies: {
			'@xpert-ai/plugin-sdk': '^3.8.0'
		}
	}))
}))

jest.mock('./plugin-instance.service', () => ({
	PluginInstanceService: class PluginInstanceService {}
}))

jest.mock('./plugin-update.utils', () => ({
	canManageGlobalPlugins: jest.fn(() => false),
	canManageSystemPlugins: jest.fn(() => true),
	canManageTenantPlugins: jest.fn(() => true)
}))

jest.mock('./plugin-instance.entity', () => ({
	resolvePluginLevel: jest.fn((level?: string) =>
		level === 'system' || level === 'tenant' ? level : 'organization'
	),
	isRestartRequiredPluginLevel: jest.fn((level?: string) => level === 'system' || level === 'tenant')
}))

const {
	RequestContext,
	derivePluginArtifactNamespace,
	getErrorMessage,
	resolveTenantGlobalScopeKey
} = require('@xpert-ai/plugin-sdk')
const { t } = require('i18next')
const { canManageGlobalPlugins, canManageSystemPlugins, canManageTenantPlugins } = require('./plugin-update.utils')
const { loadPlugin } = require('./plugin-loader')
const { registerPluginControllerRoutes, snapshotHttpRouteStack, snapshotModuleIds } = require('./plugin-http-routes')
const {
	assertInstalledPluginSdkCompatibility,
	assertPluginSdkCompatibility,
	assertPluginSdkInstallCandidate
} = require('./plugin-sdk-versioning')
const {
	collectProvidersWithMetadata,
	getEntitiesFromPlugins,
	getSubscribersFromPlugins,
	PLUGIN_SYSTEM_LEVEL_INSTALL_FORBIDDEN_CODE,
	registerPluginsAsync,
	upsertPluginLoadFailure
} = require('./plugin.helper')
const {
	getOrganizationPluginPath,
	getOrganizationPluginRoot,
	stagePackageDirectoryPlugin
} = require('./organization-plugin.store')
const { cleanupExtractedPluginArchive, extractPluginArchive, readPluginPackageJson } = require('./plugin-archive')
const { isRestartRequiredPluginLevel, resolvePluginLevel } = require('./plugin-instance.entity')
const { PluginManagementService } = require('./plugin-management.service')
const { PluginUninstallService } = require('./uninstall/plugin-uninstall.service')

class ExistingEntity {}
class ExistingSubscriber {}

export function setupPluginManagementTests() {
	const pluginInstanceService = {
		findOneByPluginName: jest.fn(),
		findSystemLevelRegistration: jest.fn(),
		findTenantLevelOwner: jest.fn(),
		getDefaultTenantId: jest.fn(),
		deactivate: jest.fn(),
		uninstall: jest.fn(),
		uninstallByPackageName: jest.fn(),
		removePlugins: jest.fn(),
		upsert: jest.fn()
	}

	const strategyBus = {
		upsert: jest.fn(),
		remove: jest.fn()
	}

	const lazyLoader = {
		load: jest.fn()
	}

	const moduleRef = {}
	const dataSource = {
		options: {
			entities: [ExistingEntity],
			subscribers: [ExistingSubscriber],
			synchronize: false
		},
		isInitialized: true,
		setOptions: jest.fn(function (options: Record<string, any>) {
			this.options = { ...this.options, ...options }
			return this
		}),
		synchronize: jest.fn(),
		buildMetadatas: jest.fn()
	}
	const loadedPlugins: Array<any> = []
	const applicationConfig = {
		getGlobalPrefix: jest.fn(() => 'api')
	}
	const runtimeControl = {
		recordPluginRuntimeChange: jest.fn(),
		recordPluginRuntimeRequirements: jest.fn()
	}
	const runtimeState = {
		report: jest.fn()
	}

	let service: InstanceType<typeof PluginManagementService>

	beforeEach(() => {
		jest.resetAllMocks()
		loadedPlugins.length = 0
		;(derivePluginArtifactNamespace as jest.Mock).mockImplementation((packageName: string) =>
			packageName
				.replace(/^@[^/]+\//, '')
				.replace(/^plugin-/, '')
				.replace(/[^a-zA-Z0-9]+/g, '_')
				.replace(/^_+|_+$/g, '')
				.toLowerCase()
		)
		;(t as jest.Mock).mockImplementation(
			(_: string, options?: Record<string, any>) => options?.errorMessage ?? options?.pluginName ?? ''
		)
		;(getErrorMessage as jest.Mock).mockImplementation((error: unknown) =>
			error instanceof Error ? error.message : String(error)
		)
		;(resolvePluginLevel as jest.Mock).mockImplementation((level?: string) =>
			level === 'system' || level === 'tenant' ? level : 'organization'
		)
		;(isRestartRequiredPluginLevel as jest.Mock).mockImplementation(
			(level?: string) => level === 'system' || level === 'tenant'
		)
		resolveTenantGlobalScopeKey.mockImplementation((tenantId?: string | null) =>
			tenantId && tenantId !== 'tenant-1' ? `tenant:${tenantId}:global` : '__global__'
		)
		;(canManageGlobalPlugins as jest.Mock).mockReturnValue(false)
		;(canManageSystemPlugins as jest.Mock).mockReturnValue(true)
		;(canManageTenantPlugins as jest.Mock).mockReturnValue(true)
		pluginInstanceService.findTenantLevelOwner.mockResolvedValue(null)
		pluginInstanceService.findSystemLevelRegistration.mockResolvedValue(null)
		dataSource.options = {
			entities: [ExistingEntity],
			subscribers: [ExistingSubscriber],
			synchronize: false
		}
		dataSource.isInitialized = true
		dataSource.setOptions.mockImplementation(function (options: Record<string, any>) {
			this.options = { ...this.options, ...options }
			return this
		})
		;(snapshotHttpRouteStack as jest.Mock).mockReturnValue(null)
		;(snapshotModuleIds as jest.Mock).mockReturnValue(new Set())
		;(getOrganizationPluginPath as jest.Mock).mockImplementation((organizationId: string, pluginName: string) => {
			const sanitizedName = pluginName.replace(/[\/@]/g, '__')
			return `/tmp/plugins/${organizationId}/${sanitizedName}`
		})
		;(getOrganizationPluginRoot as jest.Mock).mockReturnValue('/tmp/plugins')
		;(registerPluginControllerRoutes as jest.Mock).mockReturnValue({
			controllerCount: 0,
			moduleCount: 0
		})
		;(collectProvidersWithMetadata as jest.Mock).mockReturnValue([])
		;(registerPluginsAsync as jest.Mock).mockResolvedValue({ modules: [], errors: [] })
		runtimeControl.recordPluginRuntimeChange.mockResolvedValue({ scheduled: true, generation: 1 })
		runtimeControl.recordPluginRuntimeRequirements.mockResolvedValue({ scheduled: true, generation: 2 })
		runtimeState.report.mockResolvedValue(undefined)
		;(assertPluginSdkInstallCandidate as jest.Mock).mockResolvedValue({
			hostVersion: '3.8.4',
			peerRange: '^3.8.0',
			warnings: []
		})
		;(assertInstalledPluginSdkCompatibility as jest.Mock).mockReturnValue({
			hostVersion: '3.8.4',
			peerRange: '^3.8.0',
			warnings: [],
			level: 'organization',
			version: '1.0.0'
		})
		;(readPluginPackageJson as jest.Mock).mockReturnValue({
			name: '@xpert-ai/plugin-uploaded-demo',
			version: '0.2.0',
			peerDependencies: {
				'@xpert-ai/plugin-sdk': '^3.8.0'
			}
		})
		service = new PluginManagementService(
			loadedPlugins,
			pluginInstanceService,
			strategyBus,
			lazyLoader,
			moduleRef,
			dataSource,
			applicationConfig,
			runtimeControl as unknown as RuntimeControlService,
			runtimeState,
			new PluginUninstallService(loadedPlugins, pluginInstanceService, strategyBus, runtimeControl, runtimeState)
		)
		RequestContext.getOrganizationId.mockReturnValue('org-1')
		RequestContext.currentTenantId.mockReturnValue('tenant-1')
		RequestContext.getScope.mockReturnValue({
			tenantId: 'tenant-1',
			organizationId: 'org-1'
		})
		pluginInstanceService.findOneByPluginName.mockResolvedValue(null)
		pluginInstanceService.getDefaultTenantId.mockResolvedValue('tenant-1')
	})

	return {
		get service() {
			return service
		},
		z,
		mkdtempSync,
		mkdirSync,
		rmSync,
		writeFileSync,
		tmpdir,
		join,
		Entity,
		ExistingEntity,
		ExistingSubscriber,
		RequestContext,
		derivePluginArtifactNamespace,
		getErrorMessage,
		resolveTenantGlobalScopeKey,
		t,
		canManageGlobalPlugins,
		canManageSystemPlugins,
		canManageTenantPlugins,
		loadPlugin,
		registerPluginControllerRoutes,
		snapshotHttpRouteStack,
		snapshotModuleIds,
		assertInstalledPluginSdkCompatibility,
		assertPluginSdkCompatibility,
		assertPluginSdkInstallCandidate,
		collectProvidersWithMetadata,
		getEntitiesFromPlugins,
		getSubscribersFromPlugins,
		PLUGIN_SYSTEM_LEVEL_INSTALL_FORBIDDEN_CODE,
		registerPluginsAsync,
		upsertPluginLoadFailure,
		getOrganizationPluginPath,
		getOrganizationPluginRoot,
		stagePackageDirectoryPlugin,
		cleanupExtractedPluginArchive,
		extractPluginArchive,
		readPluginPackageJson,
		isRestartRequiredPluginLevel,
		resolvePluginLevel,
		PluginManagementService,
		PluginUninstallService,
		pluginInstanceService,
		strategyBus,
		lazyLoader,
		moduleRef,
		dataSource,
		loadedPlugins,
		applicationConfig,
		runtimeControl,
		runtimeState
	}
}
