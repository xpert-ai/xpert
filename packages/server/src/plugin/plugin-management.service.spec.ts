import { setupPluginManagementTests } from './plugin-management.test-fixture'
import type { RuntimeControlService } from '../runtime-control/runtime-control.service'
import type { PluginSchemaSyncService } from './plugin-schema-sync.service'

describe('PluginManagementService', () => {
	const fixture = setupPluginManagementTests()
	const {
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
		loadPlugin,
		registerPluginControllerRoutes,
		snapshotModuleIds,
		assertPluginSdkInstallCandidate,
		collectProvidersWithMetadata,
		getEntitiesFromPlugins,
		getSubscribersFromPlugins,
		registerPluginsAsync,
		upsertPluginLoadFailure,
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
	} = fixture

	it('schedules cluster convergence after an organization plugin is installed', async () => {
		;(loadPlugin as jest.Mock).mockResolvedValue({
			meta: {
				name: '@xpert-ai/plugin-openrouter',
				version: '0.1.0',
				level: 'organization'
			}
		})

		await expect(
			fixture.service.installPlugin({
				pluginName: '@xpert-ai/plugin-openrouter',
				version: '0.1.0'
			})
		).resolves.toEqual(
			expect.objectContaining({
				success: true,
				currentVersion: '0.1.0',
				runtimeConvergence: { generation: 1 },
				runtimeRequirements: [
					{
						scopeKey: 'org-1',
						pluginName: '@xpert-ai/plugin-openrouter',
						version: '0.1.0',
						state: 'loaded'
					}
				]
			})
		)
		expect(runtimeState.report).toHaveBeenCalled()

		expect(runtimeControl.recordPluginRuntimeChange).toHaveBeenCalledWith({
			pluginName: '@xpert-ai/plugin-openrouter',
			version: '0.1.0',
			scopeKey: 'org-1'
		})
	})

	it('keeps the current plugin active when schema preflight fails', async () => {
		const schemaSync = {
			synchronize: jest.fn().mockRejectedValue(new Error('schema migration failed'))
		}
		const guardedService = new PluginManagementService(
			loadedPlugins,
			pluginInstanceService,
			strategyBus,
			lazyLoader,
			moduleRef,
			dataSource,
			applicationConfig,
			runtimeControl as unknown as RuntimeControlService,
			runtimeState,
			new PluginUninstallService(loadedPlugins, pluginInstanceService, strategyBus, runtimeControl, runtimeState),
			schemaSync as unknown as PluginSchemaSyncService
		)
		;(loadPlugin as jest.Mock).mockResolvedValue({
			meta: {
				name: '@xpert-ai/plugin-openrouter',
				version: '0.2.0',
				level: 'organization'
			}
		})

		await expect(
			guardedService.installPlugin({
				pluginName: '@xpert-ai/plugin-openrouter',
				version: '0.2.0'
			})
		).rejects.toThrow('schema migration failed')
		expect(schemaSync.synchronize).toHaveBeenCalled()
		expect(pluginInstanceService.uninstallByPackageName).not.toHaveBeenCalled()
		expect(pluginInstanceService.upsert).not.toHaveBeenCalled()
	})

	it('falls back to an explicit restart when cluster convergence cannot be scheduled', async () => {
		runtimeControl.recordPluginRuntimeChange.mockResolvedValue({ scheduled: false, generation: 1 })
		;(loadPlugin as jest.Mock).mockResolvedValue({
			meta: {
				name: '@xpert-ai/plugin-openrouter',
				version: '0.1.0',
				level: 'organization'
			}
		})

		await expect(
			fixture.service.installPlugin({
				pluginName: '@xpert-ai/plugin-openrouter',
				version: '0.1.0'
			})
		).resolves.toEqual(expect.objectContaining({ restartRequired: true }))
	})

	it('persists a non-blocking configuration warning when install-time config is invalid', async () => {
		;(loadPlugin as jest.Mock).mockResolvedValue({
			meta: {
				name: '@xpert-ai/plugin-config-demo',
				version: '1.0.0',
				level: 'organization'
			},
			config: {
				schema: z.object({
					apiKey: z.string().min(1)
				})
			}
		})

		await expect(
			fixture.service.installPlugin({
				pluginName: '@xpert-ai/plugin-config-demo'
			})
		).resolves.toEqual(
			expect.objectContaining({
				success: true,
				name: '@xpert-ai/plugin-config-demo'
			})
		)

		expect(pluginInstanceService.upsert).toHaveBeenCalledWith(
			expect.objectContaining({
				pluginName: '@xpert-ai/plugin-config-demo',
				configurationStatus: 'invalid',
				configurationError: expect.stringContaining('apiKey')
			})
		)
		expect(assertPluginSdkInstallCandidate).toHaveBeenCalledWith({
			pluginName: '@xpert-ai/plugin-config-demo',
			version: undefined,
			source: 'marketplace',
			sourceConfig: null
		})
	})

	it('rejects installing a different plugin with an occupied artifact namespace', async () => {
		loadedPlugins.push({
			organizationId: 'org-other',
			scopeKey: 'org-other',
			name: '@xpert-ai/plugin-office-editor',
			packageName: '@xpert-ai/plugin-office-editor',
			instance: {
				meta: {
					name: '@xpert-ai/plugin-office-editor',
					artifactNamespace: 'office_editor'
				}
			},
			ctx: {}
		})
		;(loadPlugin as jest.Mock).mockResolvedValue({
			meta: {
				name: '@xpert-ai/plugin-office-reports',
				version: '1.0.0',
				level: 'organization',
				artifactNamespace: 'office_editor'
			}
		})

		await expect(
			fixture.service.installPlugin({
				pluginName: '@xpert-ai/plugin-office-reports'
			})
		).rejects.toThrow('artifactNamespace="office_editor"')

		expect(dataSource.setOptions).not.toHaveBeenCalled()
		expect(lazyLoader.load).not.toHaveBeenCalled()
	})

	it('rejects installing a plugin when the namespace is occupied by a loaded bundle manifest', async () => {
		const bundleRoot = mkdtempSync(join(tmpdir(), 'xpert-loaded-plugin-bundle-'))
		try {
			mkdirSync(join(bundleRoot, '.xpertai-plugin'), { recursive: true })
			writeFileSync(
				join(bundleRoot, '.xpertai-plugin', 'plugin.json'),
				JSON.stringify(
					{
						name: '@xpert-ai/plugin-bundle-owner',
						version: '0.1.0',
						artifactNamespace: 'bundle_tools'
					},
					null,
					2
				)
			)
			loadedPlugins.push({
				organizationId: 'org-other',
				scopeKey: 'org-other',
				name: '@xpert-ai/plugin-bundle-owner',
				packageName: '@xpert-ai/plugin-bundle-owner',
				baseDir: bundleRoot,
				instance: {
					meta: {
						name: '@xpert-ai/plugin-bundle-owner'
					}
				},
				ctx: {}
			})
			;(loadPlugin as jest.Mock).mockResolvedValue({
				meta: {
					name: '@xpert-ai/plugin-bundle-candidate',
					version: '1.0.0',
					level: 'organization',
					artifactNamespace: 'bundle_tools'
				}
			})

			await expect(
				fixture.service.installPlugin({
					pluginName: '@xpert-ai/plugin-bundle-candidate'
				})
			).rejects.toThrow('artifactNamespace="bundle_tools"')
		} finally {
			rmSync(bundleRoot, { recursive: true, force: true })
		}
	})

	it('allows reinstalling the same plugin with its existing artifact namespace', async () => {
		loadedPlugins.push({
			organizationId: 'org-1',
			scopeKey: 'org-1',
			name: '@xpert-ai/plugin-office-editor',
			packageName: '@xpert-ai/plugin-office-editor',
			instance: {
				meta: {
					name: '@xpert-ai/plugin-office-editor',
					artifactNamespace: 'office_editor'
				}
			},
			ctx: {}
		})
		;(loadPlugin as jest.Mock).mockResolvedValue({
			meta: {
				name: '@xpert-ai/plugin-office-editor',
				version: '1.0.1',
				level: 'organization',
				artifactNamespace: 'office_editor'
			}
		})

		await expect(
			fixture.service.installPlugin({
				pluginName: '@xpert-ai/plugin-office-editor'
			})
		).resolves.toEqual(
			expect.objectContaining({
				success: true,
				name: '@xpert-ai/plugin-office-editor'
			})
		)
	})

	it('registers plugin orm metadata before lazy-loading plugin modules', async () => {
		@Entity('plugin_runtime_demo_runtime')
		class RuntimeEntity {}
		class RuntimeSubscriber {}

		;(getEntitiesFromPlugins as jest.Mock).mockReturnValue([RuntimeEntity])
		;(getSubscribersFromPlugins as jest.Mock).mockReturnValue([RuntimeSubscriber])
		;(registerPluginsAsync as jest.Mock).mockResolvedValue({
			modules: [
				{
					module: class RuntimePluginModule {}
				}
			],
			errors: []
		})
		;(loadPlugin as jest.Mock).mockResolvedValue({
			meta: {
				name: '@xpert-ai/plugin-runtime-demo',
				version: '1.0.0',
				level: 'organization'
			}
		})
		lazyLoader.load.mockResolvedValue({})

		await expect(
			fixture.service.installPlugin({
				pluginName: '@xpert-ai/plugin-runtime-demo'
			})
		).resolves.toEqual(
			expect.objectContaining({
				success: true,
				name: '@xpert-ai/plugin-runtime-demo'
			})
		)

		expect(dataSource.setOptions).toHaveBeenCalledWith(
			expect.objectContaining({
				entities: [ExistingEntity, RuntimeEntity],
				subscribers: [ExistingSubscriber, RuntimeSubscriber]
			})
		)
		expect(snapshotModuleIds).toHaveBeenCalledWith(moduleRef)
		expect(registerPluginControllerRoutes).toHaveBeenCalledWith(
			expect.objectContaining({
				moduleRef,
				applicationConfig,
				rootModuleType: expect.any(Function)
			})
		)
		expect(collectProvidersWithMetadata).toHaveBeenCalledWith(
			{},
			'org-1',
			'@xpert-ai/plugin-runtime-demo',
			expect.anything(),
			expect.any(Set)
		)
		expect(dataSource.buildMetadatas).toHaveBeenCalledTimes(1)
		expect(dataSource.buildMetadatas.mock.invocationCallOrder[0]).toBeLessThan(
			lazyLoader.load.mock.invocationCallOrder[0]
		)
		expect(dataSource.synchronize).not.toHaveBeenCalled()
	})

	it('persists a placeholder plugin record when installation fails', async () => {
		;(registerPluginsAsync as jest.Mock).mockResolvedValue({
			modules: [],
			errors: [
				{
					error: 'Cannot find module ./dist/index.js'
				}
			]
		})

		await expect(
			fixture.service.installPlugin({
				pluginName: '@xpert-ai/plugin-broken-demo',
				source: 'npm'
			})
		).rejects.toBeInstanceOf(Error)

		expect(pluginInstanceService.upsert).toHaveBeenCalledWith(
			expect.objectContaining({
				pluginName: '@xpert-ai/plugin-broken-demo',
				packageName: '@xpert-ai/plugin-broken-demo',
				source: 'npm'
			})
		)
		expect(upsertPluginLoadFailure).toHaveBeenCalledWith(
			expect.objectContaining({
				pluginName: '@xpert-ai/plugin-broken-demo'
			})
		)
	})

	it('continues installing when sdk preflight returns compatibility warnings', async () => {
		;(assertPluginSdkInstallCandidate as jest.Mock).mockResolvedValue({
			hostVersion: '4.0.0',
			peerRange: '^3.9.1',
			warnings: [
				{
					code: 'plugin-sdk-peer-range-incompatible',
					packageName: '@xpert-ai/plugin-future-demo',
					hostVersion: '4.0.0',
					peerRange: '^3.9.1',
					message:
						'@xpert-ai/plugin-sdk peerDependencies range "^3.9.1" is incompatible with host SDK version 4.0.0.'
				}
			]
		})
		;(loadPlugin as jest.Mock).mockResolvedValue({
			meta: {
				name: '@xpert-ai/plugin-future-demo',
				version: '1.2.3',
				level: 'organization'
			}
		})

		await expect(
			fixture.service.installPlugin({
				pluginName: '@xpert-ai/plugin-future-demo',
				version: '1.2.3',
				source: 'npm'
			})
		).resolves.toEqual(
			expect.objectContaining({
				success: true,
				name: '@xpert-ai/plugin-future-demo'
			})
		)

		expect(assertPluginSdkInstallCandidate).toHaveBeenCalledWith({
			pluginName: '@xpert-ai/plugin-future-demo',
			version: '1.2.3',
			source: 'npm',
			sourceConfig: null
		})
		expect(pluginInstanceService.uninstallByPackageName).toHaveBeenCalledWith(
			'tenant-1',
			'org-1',
			'@xpert-ai/plugin-future-demo',
			{
				scopeKey: 'org-1',
				cause: 'refresh'
			}
		)
		expect(registerPluginsAsync).toHaveBeenCalled()
		expect(pluginInstanceService.upsert).toHaveBeenCalledWith(
			expect.objectContaining({
				pluginName: '@xpert-ai/plugin-future-demo',
				version: '1.2.3'
			})
		)
		expect(upsertPluginLoadFailure).not.toHaveBeenCalled()
	})
})
