import { CanActivate, ExecutionContext, INestApplication, Injectable, UnauthorizedException } from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import { CommandBus, QueryBus } from '@nestjs/cqrs'
import { Test } from '@nestjs/testing'
import { AIPermissionsEnum, IUser, PermissionsEnum, PLUGIN_LEVEL, RolesEnum } from '@xpert-ai/contracts'
import {
	GLOBAL_ORGANIZATION_SCOPE,
	RequestContextMiddleware,
	setDefaultTenantId,
	XpertToolProviderRegistry
} from '@xpert-ai/plugin-sdk'
import { EndpointPermissionInterceptor } from '../shared/guards/endpoint-permission.interceptor'
import { ResolveUserOrganizationAccessCommand } from '../user-organization/commands/resolve-user-organization-access.command'
import { RuntimeControlController } from '../runtime-control/runtime-control.controller'
import { RuntimeControlService } from '../runtime-control/runtime-control.service'
import { PluginController } from './plugin.controller'
import { PluginInstanceService } from './plugin-instance.service'
import { PluginManagementService } from './plugin-management.service'
import { PluginMarketplaceController } from './marketplace/plugin-marketplace.controller'
import { PluginMarketplacePublicController } from './marketplace/plugin-marketplace-public.controller'
import { PluginMarketplaceService } from './marketplace/plugin-marketplace.service'
import { LoadedPluginRecord, LOADED_PLUGINS } from './types'

jest.mock('./plugin.helper', () => ({ findPluginLoadFailure: jest.fn() }))
jest.mock('./plugin-instance.service', () => ({ PluginInstanceService: class {} }))
jest.mock('./plugin-management.service', () => ({ PluginManagementService: class {} }))
jest.mock('./marketplace/plugin-marketplace.service', () => ({ PluginMarketplaceService: class {} }))
jest.mock('../runtime-control/runtime-control.service', () => ({ RuntimeControlService: class {} }))
jest.mock('./plugin-instance.entity', () => ({
	resolvePluginLevel: (level?: string) => (level === 'system' || level === 'tenant' ? level : 'organization')
}))

@Injectable()
class TestAuthentication implements CanActivate {
	constructor(private readonly reflector: Reflector) {}
	canActivate(context: ExecutionContext) {
		const request = context.switchToHttp().getRequest<{ headers: Record<string, string>; user?: IUser }>()
		const actor = request.headers.authorization
		if (!actor) {
			if (this.reflector.getAllAndOverride<boolean>('isPublic', [context.getHandler(), context.getClass()]))
				return true
			throw new UnauthorizedException()
		}
		const permissions: string[] = actor === 'viewer' ? [] : [AIPermissionsEnum.XPERT_EDIT]
		if (actor === 'super') permissions.push(PermissionsEnum.SUPER_ADMIN_EDIT)
		request.user = {
			id: actor,
			tenantId: 'tenant-a',
			roleId: 'role',
			isActive: true,
			role: {
				id: 'role',
				name: actor.startsWith('super') ? RolesEnum.SUPER_ADMIN : RolesEnum.ADMIN,
				rolePermissions: permissions.map((permission) => ({
					roleId: 'role',
					tenantId: 'tenant-a',
					permission,
					enabled: actor !== 'revoked',
					role: { id: 'role', name: RolesEnum.ADMIN }
				}))
			}
		}
		return true
	}
}

describe('plugin HTTP authorization', () => {
	let app: INestApplication
	let origin: string
	let membershipActive = true
	const loadedPlugins: LoadedPluginRecord[] = []
	const instanceService = {
		findVisibleInOrganization: jest.fn(async () => []),
		findOneByPluginName: jest.fn(),
		getDefaultTenantId: jest.fn(async () => 'tenant-a'),
		getConfig: jest.fn(() => ({})),
		upsert: jest.fn()
	}
	const management = {
		readLoadedPluginBundleComponents: jest.fn(() => []),
		findLoadedPlugin: jest.fn((name: string, organizationId: string) =>
			loadedPlugins.find(
				(plugin) =>
					plugin.name === name &&
					(plugin.organizationId === organizationId || plugin.level === PLUGIN_LEVEL.SYSTEM)
			)
		),
		installPlugin: jest.fn(async () => ({ success: true })),
		refreshCodePlugin: jest.fn(async () => ({ success: true })),
		uninstallByNamesWithGuard: jest.fn(async () => ({ success: true }))
	}
	const marketplace = {
		listMarketplace: jest.fn(async () => ({ items: [{ name: 'catalog-plugin' }] })),
		listPublicMarketplace: jest.fn(async () => ({ items: [{ name: 'public-plugin' }] })),
		listSources: jest.fn(async () => ({ items: [] })),
		getMarketplacePluginDetail: jest.fn(async () => ({ name: 'catalog-plugin' })),
		getMarketplacePluginContent: jest.fn(async () => ({ name: 'catalog-plugin' })),
		getMarketplaceIconAsset: jest.fn(async () => ({
			hash: 'a'.repeat(64),
			type: 'image/png',
			data: Buffer.from('icon')
		})),
		createSource: jest.fn(async () => ({ id: 'source' })),
		updateSource: jest.fn(),
		deleteSource: jest.fn(),
		refreshSource: jest.fn(),
		refreshSources: jest.fn(),
		registry: {
			listRegistryItems: jest.fn(),
			createRegistryItem: jest.fn(),
			updateRegistryItem: jest.fn(),
			deleteRegistryItem: jest.fn()
		}
	}
	const runtime = {
		restartCapability: jest.fn(() => ({
			allowed: false,
			reason: 'super-admin-required',
			mode: 'rolling-self-signal'
		})),
		pluginConvergenceStatus: jest.fn(async () => ({ generation: 1, status: 'completed' })),
		requestRestart: jest.fn(),
		pluginRuntimeSnapshot: jest.fn(),
		listInstances: jest.fn()
	}
	const execute = jest.fn(async (command: unknown) =>
		command instanceof ResolveUserOrganizationAccessCommand
			? membershipActive && command.input.organizationId === 'org-a' && command.input.tenantId === 'tenant-a'
			: { success: true }
	)
	const headers: Record<string, string> = {
		authorization: 'admin',
		'tenant-id': 'tenant-a',
		'organization-id': 'org-a',
		'x-scope-level': 'organization'
	}
	const request = (path: string, method = 'GET', body?: unknown, scope = headers) =>
		fetch(`${origin}/api/${path}`, {
			method,
			headers: { ...scope, 'content-type': 'application/json' },
			...(body === undefined ? {} : { body: JSON.stringify(body) })
		})

	beforeAll(async () => {
		setDefaultTenantId('tenant-a')
		const module = await Test.createTestingModule({
			controllers: [
				PluginController,
				PluginMarketplacePublicController,
				PluginMarketplaceController,
				RuntimeControlController
			],
			providers: [
				TestAuthentication,
				{ provide: CommandBus, useValue: { execute } },
				{ provide: QueryBus, useValue: { execute: async () => undefined } },
				{ provide: LOADED_PLUGINS, useValue: loadedPlugins },
				{ provide: PluginInstanceService, useValue: instanceService },
				{ provide: PluginManagementService, useValue: management },
				{ provide: PluginMarketplaceService, useValue: marketplace },
				{ provide: XpertToolProviderRegistry, useValue: { listRegistrations: () => [] } },
				{ provide: RuntimeControlService, useValue: runtime }
			]
		}).compile()
		app = module.createNestApplication({ logger: false })
		app.setGlobalPrefix('api')
		app.use(new RequestContextMiddleware().use)
		app.useGlobalGuards(module.get(TestAuthentication))
		app.useGlobalInterceptors(new EndpointPermissionInterceptor(module.get(Reflector)))
		await app.listen(0, '127.0.0.1')
		origin = await app.getUrl()
	})
	beforeEach(() => {
		jest.clearAllMocks()
		membershipActive = true
		loadedPlugins.length = 0
		for (const [name, organizationId, tenantId, scopeKey, level] of [
			['own', 'org-a', 'tenant-a', 'org-a', PLUGIN_LEVEL.ORGANIZATION],
			['foreign', 'org-b', 'tenant-a', 'org-b', PLUGIN_LEVEL.ORGANIZATION],
			['tenant', GLOBAL_ORGANIZATION_SCOPE, 'tenant-a', GLOBAL_ORGANIZATION_SCOPE, PLUGIN_LEVEL.TENANT],
			['foreign-tenant', GLOBAL_ORGANIZATION_SCOPE, 'tenant-b', 'tenant:tenant-b:global', PLUGIN_LEVEL.TENANT],
			['system', GLOBAL_ORGANIZATION_SCOPE, 'tenant-a', 'system:global', PLUGIN_LEVEL.SYSTEM]
		] as const)
			loadedPlugins.push({
				name,
				organizationId,
				tenantId,
				scopeKey,
				level,
				source: 'marketplace',
				ctx: {},
				instance: { meta: { name, version: '1.0.0', level }, config: {} }
			})
	})
	afterAll(async () => {
		await app?.close()
		setDefaultTenantId(null)
	})

	it.each(['admin', 'super'])('allows %s to browse only visible installations and the marketplace', async (actor) => {
		const scope = { ...headers, authorization: actor }
		const installed = await request('plugin', 'GET', undefined, scope)
		expect(installed.status).toBe(200)
		expect((await installed.json()).map((plugin: { name: string }) => plugin.name)).toEqual([
			'own',
			'tenant',
			'system'
		])
		for (const path of [
			'plugin/marketplace',
			'plugin/marketplace/sources',
			'plugin/marketplace/detail?name=demo',
			'plugin/marketplace/demo',
			`plugin/marketplace/assets/icon?name=demo&hash=${'a'.repeat(64)}`,
			'plugin/own/components'
		]) {
			expect((await request(path, 'GET', undefined, scope)).status).toBe(200)
		}
		expect((await request('plugin/by-names', 'POST', { names: ['own'] }, scope)).status).toBe(201)
		expect((await request('plugin/latest-versions', 'POST', { names: [] }, scope)).status).toBe(201)
	})
	it.each(['viewer', 'revoked'])('denies browsing and mutations for %s', async (actor) => {
		const scope = { ...headers, authorization: actor }
		expect((await request('plugin', 'GET', undefined, scope)).status).toBe(403)
		expect((await request('plugin/marketplace', 'GET', undefined, scope)).status).toBe(403)
		expect((await request('plugin', 'POST', { pluginName: 'demo' }, scope)).status).toBe(403)
		expect(management.installPlugin).not.toHaveBeenCalled()
	})
	it('rejects foreign scopes and revoked membership before accessing business services', async () => {
		for (const scope of [
			{ ...headers, 'organization-id': 'org-b' },
			{ ...headers, 'tenant-id': 'tenant-b' }
		]) {
			expect((await request('plugin', 'GET', undefined, scope)).status).toBe(403)
			expect((await request('plugin/marketplace', 'GET', undefined, scope)).status).toBe(403)
			expect((await request('plugin', 'POST', { pluginName: 'demo' }, scope)).status).toBe(403)
		}
		membershipActive = false
		expect((await request('plugin')).status).toBe(403)
		expect(instanceService.findVisibleInOrganization).not.toHaveBeenCalled()
		expect(marketplace.listMarketplace).not.toHaveBeenCalled()
		expect(management.installPlugin).not.toHaveBeenCalled()
	})
	it('allows organization changes, but rejects tenant-scope mutations without an effective super-admin grant', async () => {
		expect((await request('plugin', 'POST', { pluginName: 'demo' })).status).toBe(201)
		expect((await request('plugin/configuration', 'PUT', { pluginName: 'own', config: {} })).status).toBe(200)
		for (const actor of ['admin', 'super-revoked']) {
			const scope = { ...headers, authorization: actor, 'organization-id': '', 'x-scope-level': 'tenant' }
			delete scope['organization-id']
			expect((await request('plugin', 'POST', { pluginName: 'demo' }, scope)).status).toBe(403)
			expect(
				(await request('plugin/configuration', 'PUT', { pluginName: 'tenant', config: {} }, scope)).status
			).toBe(403)
		}
		expect(management.installPlugin).toHaveBeenCalledTimes(1)
	})
	it('keeps inherited system and tenant configuration restricted', async () => {
		for (const pluginName of ['tenant', 'system']) {
			expect((await request('plugin/configuration', 'PUT', { pluginName, config: {} })).status).toBe(400)
		}
		expect(instanceService.upsert).not.toHaveBeenCalled()
	})
	it.each([
		['plugin/marketplace/sources', 'POST'],
		['plugin/marketplace/sources/refresh', 'POST'],
		['plugin/marketplace/sources/source', 'PUT'],
		['plugin/marketplace/sources/source', 'DELETE'],
		['plugin/marketplace/sources/source/refresh', 'POST'],
		['plugin/marketplace/registry', 'GET'],
		['plugin/marketplace/registry', 'POST'],
		['plugin/marketplace/registry/item', 'PUT'],
		['plugin/marketplace/registry/item', 'DELETE'],
		['system/runtime/restart', 'POST'],
		['system/runtime/plugin-state', 'GET'],
		['system/runtime/instances', 'GET']
	])('keeps %s %s restricted to administrators', async (path, method) => {
		expect((await request(path, method, method === 'GET' ? undefined : {})).status).toBe(403)
	})
	it('allows super-admin market management and tenant-scope plugin management', async () => {
		const scope = { ...headers, authorization: 'super', 'x-scope-level': 'tenant' }
		delete scope['organization-id']
		expect((await request('plugin', 'POST', { pluginName: 'demo' }, scope)).status).toBe(201)
		expect((await request('plugin/marketplace/sources', 'POST', {}, scope)).status).toBe(201)
	})
	it('provides organization runtime status without granting restart control', async () => {
		const capability = await request('system/runtime/restart-capability')
		expect(capability.status).toBe(200)
		expect(await capability.json()).toMatchObject({ allowed: false })
		expect((await request('system/runtime/plugin-convergence/1')).status).toBe(200)
	})
	it('preserves anonymous builtin browsing while keeping private endpoints authenticated', async () => {
		expect((await fetch(`${origin}/api/plugin/marketplace/public`)).status).toBe(200)
		for (const path of ['plugin', 'plugin/marketplace', 'plugin/marketplace/sources']) {
			expect((await fetch(`${origin}/api/${path}`)).status).toBe(401)
		}
		expect(marketplace.listPublicMarketplace).toHaveBeenCalledTimes(1)
	})
})
