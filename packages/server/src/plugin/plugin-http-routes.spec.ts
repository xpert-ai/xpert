const registerRouters = jest.fn()

jest.mock('@nestjs/core', () => {
	const actual = jest.requireActual('@nestjs/core')
	return {
		...actual,
		GraphInspector: class GraphInspector {
			insertEntrypointDefinition() {}
		}
	}
})

jest.mock('@nestjs/core/router/routes-resolver', () => ({
	RoutesResolver: jest.fn().mockImplementation(() => ({
		registerRouters
	}))
}))

import { ApplicationConfig } from '@nestjs/core'
import { snapshotHttpRouteStack, snapshotModuleIds, registerPluginControllerRoutes } from './plugin-http-routes'

class ExistingModule {}
class PluginModule {}
class PluginController {}

describe('plugin http routes helpers', () => {
	beforeEach(() => {
		jest.clearAllMocks()
	})

	it('registers controller routes for modules added after lazy loading', () => {
		const modules = new Map<string, any>([
			[
				'existing',
				{
					id: 'existing-id',
					token: 'existing',
					metatype: ExistingModule,
					controllers: new Map()
				}
			],
			[
				'plugin',
				{
					id: 'plugin-id',
					token: 'plugin',
					metatype: PluginModule,
					controllers: new Map([[PluginController, { metatype: PluginController }]])
				}
			]
		]) as Map<string, any> & { applicationId?: string }
		modules.applicationId = 'app-id'

		const moduleRef = {
			container: {
				getModules: () => modules,
				getHttpAdapterRef: () => 'http-adapter'
			},
			injector: {}
		} as any
		const applicationConfig = new ApplicationConfig()
		applicationConfig.setGlobalPrefix('api')

		const beforeModuleIds = new Set(['existing-id'])

		expect(
			registerPluginControllerRoutes({
				moduleRef,
				applicationConfig,
				beforeModuleIds,
				rootModuleType: PluginModule,
				registeredModuleIds: new Set()
			})
		).toEqual({
			controllerCount: 1,
			moduleCount: 1
		})

		expect(registerRouters).toHaveBeenCalledWith(
			modules.get('plugin').controllers,
			'plugin',
			'/api',
			undefined,
			'http-adapter'
		)
	})

	it('falls back to the root plugin module when no new modules were added', () => {
		const modules = new Map<string, any>([
			[
				'plugin',
				{
					id: 'plugin-id',
					token: 'plugin',
					metatype: PluginModule,
					controllers: new Map([[PluginController, { metatype: PluginController }]])
				}
			]
		]) as Map<string, any> & { applicationId?: string }
		modules.applicationId = 'app-id'

		const moduleRef = {
			container: {
				getModules: () => modules,
				getHttpAdapterRef: () => 'http-adapter'
			},
			injector: {}
		} as any
		const applicationConfig = new ApplicationConfig()

		expect(
			registerPluginControllerRoutes({
				moduleRef,
				applicationConfig,
				beforeModuleIds: new Set(['plugin-id']),
				rootModuleType: PluginModule,
				registeredModuleIds: new Set()
			})
		).toEqual({
			controllerCount: 1,
			moduleCount: 1
		})

		expect(registerRouters).toHaveBeenCalledTimes(1)
	})

	it('captures module ids from the current container snapshot', () => {
		const moduleRef = {
			container: {
				getModules: () =>
					new Map<string, any>([
						['a', { id: 'a-id' }],
						['b', { id: 'b-id' }]
					])
			}
		} as any

		expect(snapshotModuleIds(moduleRef as any)).toEqual(new Set(['a-id', 'b-id']))
	})

	it('moves dynamically registered express routes ahead of existing tail handlers', () => {
		const stack = [
			{ name: 'existing-route', route: { path: '/existing' } },
			{ name: 'not-found-handler' },
			{ name: 'error-handler' }
		]
		const httpAdapter = {
			getInstance: () => ({
				_router: {
					stack
				}
			})
		}
		const modules = new Map<string, any>([
			[
				'plugin',
				{
					id: 'plugin-id',
					token: 'plugin',
					metatype: PluginModule,
					controllers: new Map([[PluginController, { metatype: PluginController }]])
				}
			]
		]) as Map<string, any> & { applicationId?: string }
		modules.applicationId = 'app-id'

		const moduleRef = {
			container: {
				getModules: () => modules,
				getHttpAdapterRef: () => httpAdapter
			},
			injector: {}
		} as any
		const applicationConfig = new ApplicationConfig()
		const beforeHttpRouteSnapshot = snapshotHttpRouteStack(moduleRef as any)

		registerRouters.mockImplementationOnce(() => {
			stack.push({ name: 'plugin-route', route: { path: '/api/lark/user-select-options' } })
		})

		expect(
			registerPluginControllerRoutes({
				moduleRef,
				applicationConfig,
				beforeModuleIds: new Set(),
				beforeHttpRouteSnapshot,
				rootModuleType: PluginModule,
				registeredModuleIds: new Set()
			})
		).toEqual({
			controllerCount: 1,
			moduleCount: 1
		})

		expect(stack.map((layer) => layer.name)).toEqual([
			'existing-route',
			'plugin-route',
			'not-found-handler',
			'error-handler'
		])
	})
})
