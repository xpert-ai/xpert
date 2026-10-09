import { setupPluginManagementTests } from './plugin-management.test-fixture'

describe('PluginManagementService', () => {
	const fixture = setupPluginManagementTests()
	const {
		RequestContext,
		canManageGlobalPlugins,
		canManageSystemPlugins,
		loadPlugin,
		registerPluginControllerRoutes,
		assertInstalledPluginSdkCompatibility,
		assertPluginSdkInstallCandidate,
		PLUGIN_SYSTEM_LEVEL_INSTALL_FORBIDDEN_CODE,
		registerPluginsAsync,
		upsertPluginLoadFailure,
		pluginInstanceService,
		lazyLoader,
		dataSource,
		loadedPlugins,
		runtimeControl,
		runtimeState
	} = fixture

	it('installs tenant-scope global plugins into the current tenant scope only', async () => {
		RequestContext.getScope.mockReturnValue({
			tenantId: 'tenant-other',
			organizationId: null
		})
		RequestContext.currentTenantId.mockReturnValue('tenant-other')
		;(loadPlugin as jest.Mock).mockResolvedValue({
			meta: {
				name: '@xpert-ai/plugin-tenant-global',
				version: '1.0.0',
				level: 'organization'
			}
		})

		await expect(
			fixture.service.installPlugin({
				pluginName: '@xpert-ai/plugin-tenant-global'
			})
		).resolves.toEqual(
			expect.objectContaining({
				success: true,
				name: '@xpert-ai/plugin-tenant-global',
				organizationId: '__global__'
			})
		)

		expect(registerPluginsAsync).toHaveBeenCalledWith(
			expect.objectContaining({
				tenantId: 'tenant-other',
				organizationId: '__global__',
				defaultTenantId: 'tenant-1',
				scopeKey: 'tenant:tenant-other:global'
			}),
			expect.anything()
		)
		expect(pluginInstanceService.uninstallByPackageName).toHaveBeenCalledWith(
			'tenant-other',
			'__global__',
			'@xpert-ai/plugin-tenant-global',
			{
				scopeKey: 'tenant:tenant-other:global',
				cause: 'refresh'
			}
		)
		expect(pluginInstanceService.upsert).toHaveBeenCalledWith(
			expect.objectContaining({
				tenantId: 'tenant-other',
				organizationId: '__global__',
				scopeKey: 'tenant:tenant-other:global',
				pluginName: '@xpert-ai/plugin-tenant-global'
			})
		)
	})

	it('does not persist a placeholder plugin record when system-level installs are rejected', async () => {
		;(canManageSystemPlugins as jest.Mock).mockReturnValue(false)
		;(registerPluginsAsync as jest.Mock).mockResolvedValueOnce({
			modules: [],
			errors: [
				{
					code: PLUGIN_SYSTEM_LEVEL_INSTALL_FORBIDDEN_CODE,
					pluginName: '@xpert-ai/plugin-system-demo',
					packageName: '@xpert-ai/plugin-system-demo',
					error: 'System-level plugin "@xpert-ai/plugin-system-demo" cannot be installed in this scope'
				}
			]
		})

		await expect(
			fixture.service.installPlugin({
				pluginName: '@xpert-ai/plugin-system-demo',
				source: 'code',
				sourceConfig: {
					workspacePath: '/tmp/workspaces/plugin-system-demo'
				}
			})
		).rejects.toBeInstanceOf(Error)

		expect(registerPluginsAsync).toHaveBeenCalledWith(
			expect.objectContaining({
				allowSystemPlugins: false,
				plugins: [
					expect.objectContaining({
						name: '@xpert-ai/plugin-system-demo',
						source: 'code'
					})
				]
			}),
			expect.anything()
		)
		expect(loadPlugin).not.toHaveBeenCalled()
		expect(pluginInstanceService.upsert).not.toHaveBeenCalled()
		expect(upsertPluginLoadFailure).not.toHaveBeenCalled()
		expect(pluginInstanceService.removePlugins).toHaveBeenCalledWith(
			'org-1',
			['@xpert-ai/plugin-system-demo'],
			expect.objectContaining({
				tenantId: 'tenant-1',
				defaultTenantId: 'tenant-1'
			})
		)
	})

	it('keeps the post-load system-level guard as a defensive fallback', async () => {
		;(canManageSystemPlugins as jest.Mock).mockReturnValue(false)
		;(loadPlugin as jest.Mock).mockResolvedValue({
			meta: {
				name: '@xpert-ai/plugin-system-demo',
				version: '1.0.0',
				level: 'system'
			}
		})

		await expect(
			fixture.service.installPlugin({
				pluginName: '@xpert-ai/plugin-system-demo',
				source: 'code',
				sourceConfig: {
					workspacePath: '/tmp/workspaces/plugin-system-demo'
				}
			})
		).rejects.toBeInstanceOf(Error)

		expect(pluginInstanceService.upsert).not.toHaveBeenCalled()
		expect(upsertPluginLoadFailure).not.toHaveBeenCalled()
		expect(pluginInstanceService.removePlugins).toHaveBeenCalledWith(
			'org-1',
			['@xpert-ai/plugin-system-demo'],
			expect.objectContaining({
				tenantId: 'tenant-1',
				defaultTenantId: 'tenant-1'
			})
		)
	})

	it('rejects package metadata system-level installs outside the system management scope', async () => {
		;(canManageSystemPlugins as jest.Mock).mockReturnValue(false)
		;(assertPluginSdkInstallCandidate as jest.Mock).mockResolvedValue({
			hostVersion: '3.8.4',
			peerRange: '^3.8.0',
			warnings: [],
			level: 'system'
		})

		await expect(
			fixture.service.installPlugin({
				pluginName: '@xpert-ai/plugin-system-demo'
			})
		).rejects.toBeInstanceOf(Error)

		expect(registerPluginsAsync).not.toHaveBeenCalled()
		expect(loadPlugin).not.toHaveBeenCalled()
		expect(pluginInstanceService.upsert).not.toHaveBeenCalled()
	})

	it('stages system-level plugins without mutating the live Nest module graph', async () => {
		RequestContext.getScope.mockReturnValue({
			tenantId: 'tenant-1',
			organizationId: '__global__'
		})
		;(canManageGlobalPlugins as jest.Mock).mockReturnValue(true)
		;(canManageSystemPlugins as jest.Mock).mockReturnValue(true)
		;(assertPluginSdkInstallCandidate as jest.Mock).mockResolvedValue({
			hostVersion: '3.8.4',
			peerRange: '^3.8.0',
			warnings: [],
			level: 'system',
			version: '1.0.0',
			artifactNamespace: 'system_demo'
		})
		;(assertInstalledPluginSdkCompatibility as jest.Mock).mockReturnValue({
			hostVersion: '3.8.4',
			peerRange: '^3.8.0',
			warnings: [],
			level: 'system',
			version: '1.0.0',
			artifactNamespace: 'system_demo'
		})

		await expect(
			fixture.service.installPlugin({
				pluginName: '@xpert-ai/plugin-system-demo'
			})
		).resolves.toEqual(
			expect.objectContaining({
				success: true,
				name: '@xpert-ai/plugin-system-demo',
				organizationId: '__global__',
				runtimeConvergence: { generation: 1 }
			})
		)

		expect(pluginInstanceService.uninstallByPackageName).not.toHaveBeenCalled()
		expect(registerPluginsAsync).toHaveBeenCalledWith(
			expect.objectContaining({
				tenantId: null,
				organizationId: '__global__',
				scopeKey: 'system:global',
				stageOnly: true,
				plugins: [
					expect.objectContaining({
						name: '@xpert-ai/plugin-system-demo',
						level: 'system'
					})
				]
			}),
			expect.anything()
		)
		expect(loadPlugin).not.toHaveBeenCalled()
		expect(lazyLoader.load).not.toHaveBeenCalled()
		expect(dataSource.setOptions).not.toHaveBeenCalled()
		expect(registerPluginControllerRoutes).not.toHaveBeenCalled()
		expect(pluginInstanceService.upsert).toHaveBeenCalledWith(
			expect.objectContaining({
				tenantId: null,
				organizationId: '__global__',
				scopeKey: 'system:global',
				pluginName: '@xpert-ai/plugin-system-demo',
				level: 'system'
			}),
			{ syncLoadedConfig: false }
		)
		expect(runtimeControl.recordPluginRuntimeChange).toHaveBeenCalledWith({
			pluginName: '@xpert-ai/plugin-system-demo',
			version: '1.0.0',
			scopeKey: 'system:global'
		})
	})

	it('stages tenant-level plugins in the owning tenant global scope', async () => {
		RequestContext.getScope.mockReturnValue({
			tenantId: 'tenant-bom',
			organizationId: 'org-bom'
		})
		RequestContext.currentTenantId.mockReturnValue('tenant-bom')
		;(assertPluginSdkInstallCandidate as jest.Mock).mockResolvedValue({
			hostVersion: '3.8.4',
			peerRange: '^3.8.0',
			warnings: [],
			level: 'tenant',
			version: '1.0.0',
			artifactNamespace: 'bom'
		})
		;(assertInstalledPluginSdkCompatibility as jest.Mock).mockReturnValue({
			hostVersion: '3.8.4',
			peerRange: '^3.8.0',
			warnings: [],
			level: 'tenant',
			version: '1.0.0',
			artifactNamespace: 'bom'
		})

		await expect(
			fixture.service.installPlugin({
				pluginName: '@xpert-ai/plugin-bom'
			})
		).resolves.toEqual(
			expect.objectContaining({
				success: true,
				name: '@xpert-ai/plugin-bom',
				organizationId: '__global__',
				runtimeConvergence: { generation: 1 }
			})
		)

		expect(pluginInstanceService.findTenantLevelOwner).toHaveBeenCalledWith('@xpert-ai/plugin-bom')
		expect(registerPluginsAsync).toHaveBeenCalledWith(
			expect.objectContaining({
				tenantId: 'tenant-bom',
				organizationId: '__global__',
				scopeKey: 'tenant:tenant-bom:global',
				allowSystemPlugins: false,
				stageOnly: true,
				plugins: [expect.objectContaining({ level: 'tenant' })]
			}),
			expect.anything()
		)
		expect(pluginInstanceService.upsert).toHaveBeenCalledWith(
			expect.objectContaining({
				tenantId: 'tenant-bom',
				organizationId: '__global__',
				scopeKey: 'tenant:tenant-bom:global',
				level: 'tenant'
			}),
			{ syncLoadedConfig: false }
		)
		expect(runtimeControl.recordPluginRuntimeChange).toHaveBeenCalledWith({
			pluginName: '@xpert-ai/plugin-bom',
			version: '1.0.0',
			scopeKey: 'tenant:tenant-bom:global'
		})
		expect(loadPlugin).not.toHaveBeenCalled()
		expect(lazyLoader.load).not.toHaveBeenCalled()
	})

	it('rejects tenant-level installation when the plugin belongs to another tenant', async () => {
		RequestContext.getScope.mockReturnValue({
			tenantId: 'tenant-bom',
			organizationId: '__global__'
		})
		RequestContext.currentTenantId.mockReturnValue('tenant-bom')
		;(assertPluginSdkInstallCandidate as jest.Mock).mockResolvedValue({
			hostVersion: '3.8.4',
			peerRange: '^3.8.0',
			warnings: [],
			level: 'tenant'
		})
		pluginInstanceService.findTenantLevelOwner.mockResolvedValue({ tenantId: 'tenant-other' })

		await expect(fixture.service.installPlugin({ pluginName: '@xpert-ai/plugin-bom' })).rejects.toBeInstanceOf(
			Error
		)

		expect(registerPluginsAsync).not.toHaveBeenCalled()
		expect(pluginInstanceService.upsert).not.toHaveBeenCalled()
	})

	it('requires the old system registration to be removed before changing a plugin to tenant level', async () => {
		RequestContext.getScope.mockReturnValue({
			tenantId: 'tenant-bom',
			organizationId: '__global__'
		})
		RequestContext.currentTenantId.mockReturnValue('tenant-bom')
		;(assertPluginSdkInstallCandidate as jest.Mock).mockResolvedValue({
			hostVersion: '3.8.4',
			peerRange: '^3.8.0',
			warnings: [],
			level: 'tenant'
		})
		pluginInstanceService.findSystemLevelRegistration.mockResolvedValue({
			pluginName: '@xpert-ai/plugin-bom',
			level: 'system'
		})

		await expect(fixture.service.installPlugin({ pluginName: '@xpert-ai/plugin-bom' })).rejects.toBeInstanceOf(
			Error
		)

		expect(registerPluginsAsync).not.toHaveBeenCalled()
		expect(pluginInstanceService.upsert).not.toHaveBeenCalled()
	})

	it('stages code updates for system plugins in a new immutable runtime directory', async () => {
		RequestContext.getScope.mockReturnValue({
			tenantId: 'tenant-1',
			organizationId: '__global__'
		})
		;(canManageGlobalPlugins as jest.Mock).mockReturnValue(true)
		;(canManageSystemPlugins as jest.Mock).mockReturnValue(true)
		;(assertPluginSdkInstallCandidate as jest.Mock).mockResolvedValue({
			hostVersion: '3.8.4',
			peerRange: '^3.8.0',
			warnings: [],
			level: 'system',
			version: '1.0.1',
			artifactNamespace: 'system_demo'
		})
		;(assertInstalledPluginSdkCompatibility as jest.Mock).mockReturnValue({
			hostVersion: '3.8.4',
			peerRange: '^3.8.0',
			warnings: [],
			level: 'system',
			version: '1.0.1',
			artifactNamespace: 'system_demo'
		})

		await fixture.service.installPlugin({
			pluginName: '@xpert-ai/plugin-system-demo',
			source: 'code',
			sourceConfig: {
				workspacePath: '/tmp/workspaces/plugin-system-demo',
				runtimeName: '@xpert-ai/plugin-system-demo@runtime__active'
			}
		})

		const stagedPlugin = (registerPluginsAsync as jest.Mock).mock.calls[0][0].plugins[0]
		expect(stagedPlugin.runtimeName).toMatch(/^@xpert-ai\/plugin-system-demo@runtime__/)
		expect(stagedPlugin.runtimeName).not.toBe('@xpert-ai/plugin-system-demo@runtime__active')
		expect(stagedPlugin.sourceConfig).toEqual({
			workspacePath: '/tmp/workspaces/plugin-system-demo',
			runtimeName: stagedPlugin.runtimeName
		})
		expect(pluginInstanceService.upsert).toHaveBeenCalledWith(
			expect.objectContaining({
				sourceConfig: {
					workspacePath: '/tmp/workspaces/plugin-system-demo',
					runtimeName: stagedPlugin.runtimeName
				}
			}),
			{ syncLoadedConfig: false }
		)
		expect(pluginInstanceService.uninstallByPackageName).not.toHaveBeenCalled()
		expect(pluginInstanceService.removePlugins).not.toHaveBeenCalled()
	})

	it('rejects system-level installs from non-default tenants before touching the singleton scope', async () => {
		RequestContext.getScope.mockReturnValue({
			tenantId: 'tenant-other',
			organizationId: 'org-other'
		})
		RequestContext.currentTenantId.mockReturnValue('tenant-other')
		;(canManageSystemPlugins as jest.Mock).mockReturnValue(true)
		;(assertPluginSdkInstallCandidate as jest.Mock).mockResolvedValue({
			hostVersion: '3.8.4',
			peerRange: '^3.8.0',
			warnings: [],
			level: 'system'
		})
		;(loadPlugin as jest.Mock).mockResolvedValue({
			meta: {
				name: '@xpert-ai/plugin-system-demo',
				version: '1.0.0',
				level: 'system'
			}
		})

		await expect(
			fixture.service.installPlugin({
				pluginName: '@xpert-ai/plugin-system-demo'
			})
		).rejects.toBeInstanceOf(Error)

		expect(pluginInstanceService.uninstallByPackageName).not.toHaveBeenCalled()
		expect(registerPluginsAsync).not.toHaveBeenCalled()
		expect(loadPlugin).not.toHaveBeenCalled()
		expect(pluginInstanceService.removePlugins).not.toHaveBeenCalled()
		expect(pluginInstanceService.upsert).not.toHaveBeenCalled()
	})

	it('allows super admins to uninstall global plugins from an organization context', async () => {
		;(canManageGlobalPlugins as jest.Mock).mockReturnValue(true)

		await expect(
			fixture.service.uninstallByNamesWithGuard(['@xpert-ai/plugin-global-demo'], '__global__')
		).resolves.toMatchObject({ runtimeConvergence: { generation: 2 } })

		expect(pluginInstanceService.uninstall).toHaveBeenCalledWith(
			'tenant-1',
			'__global__',
			['@xpert-ai/plugin-global-demo'],
			{ scopeKey: '__global__', cause: 'uninstall' }
		)
	})

	it('rejects global plugin uninstalls for non-super-admin users', async () => {
		;(canManageGlobalPlugins as jest.Mock).mockReturnValue(false)

		await expect(
			fixture.service.uninstallByNamesWithGuard(['@xpert-ai/plugin-global-demo'], '__global__')
		).rejects.toThrow('Only super admins can uninstall global plugins')

		expect(pluginInstanceService.uninstall).not.toHaveBeenCalled()
	})

	it('deactivates system plugins persistently and requires a process restart to unload them', async () => {
		RequestContext.getScope.mockReturnValue({
			tenantId: 'tenant-1',
			organizationId: '__global__'
		})
		;(canManageGlobalPlugins as jest.Mock).mockReturnValue(true)
		;(canManageSystemPlugins as jest.Mock).mockReturnValue(true)

		await expect(
			fixture.service.uninstallByNamesWithGuard(['@xpert-ai/plugin-system-demo'], '__global__', 'system:global')
		).resolves.toEqual(
			expect.objectContaining({
				restartRequired: true,
				runtimeRequirements: [
					{
						scopeKey: 'system:global',
						pluginName: '@xpert-ai/plugin-system-demo',
						state: 'absent'
					}
				]
			})
		)

		expect(pluginInstanceService.deactivate).toHaveBeenCalledWith(
			'tenant-1',
			'__global__',
			['@xpert-ai/plugin-system-demo'],
			{ scopeKey: 'system:global' }
		)
		expect(pluginInstanceService.uninstall).not.toHaveBeenCalled()
		expect(pluginInstanceService.removePlugins).not.toHaveBeenCalled()
	})

	it('deactivates tenant-level plugins in their owning tenant and requires a restart', async () => {
		RequestContext.getScope.mockReturnValue({
			tenantId: 'tenant-bom',
			organizationId: '__global__'
		})
		RequestContext.currentTenantId.mockReturnValue('tenant-bom')
		;(canManageGlobalPlugins as jest.Mock).mockReturnValue(true)
		loadedPlugins.push({
			tenantId: 'tenant-bom',
			organizationId: '__global__',
			scopeKey: 'tenant:tenant-bom:global',
			name: '@xpert-ai/plugin-bom',
			packageName: '@xpert-ai/plugin-bom',
			level: 'tenant'
		})

		await expect(
			fixture.service.uninstallByNamesWithGuard(
				['@xpert-ai/plugin-bom'],
				'__global__',
				'tenant:tenant-bom:global'
			)
		).resolves.toEqual(
			expect.objectContaining({
				restartRequired: true,
				runtimeRequirements: [
					{
						scopeKey: 'tenant:tenant-bom:global',
						pluginName: '@xpert-ai/plugin-bom',
						state: 'absent'
					}
				]
			})
		)

		expect(pluginInstanceService.deactivate).toHaveBeenCalledWith(
			'tenant-bom',
			'__global__',
			['@xpert-ai/plugin-bom'],
			{ scopeKey: 'tenant:tenant-bom:global' }
		)
		expect(pluginInstanceService.uninstall).not.toHaveBeenCalled()
	})

	it('publishes removals only after uninstall succeeds and reports the unloaded local state first', async () => {
		const uninstalls = jest.mocked(pluginInstanceService.uninstall)
		uninstalls.mockRejectedValueOnce(new Error('delete failed'))
		await expect(fixture.service.uninstallByNamesWithGuard(['demo'])).rejects.toThrow('delete failed')
		expect(runtimeControl.recordPluginRuntimeRequirements).not.toHaveBeenCalled()
		expect(runtimeState.report).not.toHaveBeenCalled()
		uninstalls.mockResolvedValueOnce(undefined)
		await expect(fixture.service.uninstallByNamesWithGuard(['demo', 'other'])).resolves.toEqual({
			runtimeConvergence: { generation: 2 },
			runtimeRequirements: [
				{ scopeKey: 'org-1', pluginName: 'demo', state: 'absent' },
				{ scopeKey: 'org-1', pluginName: 'other', state: 'absent' }
			]
		})
		expect(runtimeState.report.mock.invocationCallOrder[0]).toBeLessThan(
			runtimeControl.recordPluginRuntimeRequirements.mock.invocationCallOrder[0]
		)
		expect(runtimeControl.recordPluginRuntimeRequirements).toHaveBeenCalledWith(
			[
				{ scopeKey: 'org-1', pluginName: 'demo', state: 'absent' },
				{ scopeKey: 'org-1', pluginName: 'other', state: 'absent' }
			],
			expect.any(String)
		)
	})

	it('returns absent requirements for explicit retry when removal convergence cannot be published', async () => {
		runtimeControl.recordPluginRuntimeRequirements.mockResolvedValue({ scheduled: false, generation: 0 })
		await expect(fixture.service.uninstallByNamesWithGuard(['demo'])).resolves.toEqual({
			restartRequired: true,
			runtimeRequirements: [{ scopeKey: 'org-1', pluginName: 'demo', state: 'absent' }]
		})
	})
})
