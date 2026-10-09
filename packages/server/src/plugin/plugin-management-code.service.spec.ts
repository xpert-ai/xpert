import { setupPluginManagementTests } from './plugin-management.test-fixture'

describe('PluginManagementService', () => {
	const fixture = setupPluginManagementTests()
	const {
		mkdtempSync,
		mkdirSync,
		rmSync,
		writeFileSync,
		tmpdir,
		join,
		loadPlugin,
		assertPluginSdkCompatibility,
		assertPluginSdkInstallCandidate,
		registerPluginsAsync,
		getOrganizationPluginPath,
		cleanupExtractedPluginArchive,
		extractPluginArchive,
		readPluginPackageJson,
		pluginInstanceService,
		loadedPlugins,
		runtimeControl
	} = fixture

	it('reads bundle components from a code plugin workspace path when the staged base dir has no manifest', () => {
		const workspacePath = mkdtempSync(join(tmpdir(), 'xpert-code-plugin-bundle-'))
		try {
			mkdirSync(join(workspacePath, '.xpertai-plugin'), { recursive: true })
			mkdirSync(join(workspacePath, 'skills', 'browser-research'), { recursive: true })
			writeFileSync(
				join(workspacePath, '.xpertai-plugin', 'plugin.json'),
				JSON.stringify(
					{
						name: '@xpert-ai/plugin-xpertai-browser-lab',
						version: '0.1.0',
						skills: './skills'
					},
					null,
					2
				)
			)
			writeFileSync(
				join(workspacePath, 'skills', 'browser-research', 'SKILL.md'),
				[
					'---',
					'name: browser-research',
					'description: Browser research.',
					'---',
					'',
					'Use browser evidence.'
				].join('\n')
			)

			const components = fixture.service.readLoadedPluginBundleComponents({
				organizationId: 'org-1',
				name: '@xpert-ai/plugin-xpertai-browser-lab',
				packageName: '@xpert-ai/plugin-xpertai-browser-lab',
				baseDir: '/tmp/staged-plugin-without-manifest',
				source: 'code',
				sourceConfig: {
					workspacePath
				},
				instance: {},
				ctx: {}
			})

			expect(components).toEqual([
				expect.objectContaining({
					componentType: 'skill',
					componentKey: 'browser-research',
					sourcePath: './skills/browser-research/SKILL.md'
				})
			])
		} finally {
			rmSync(workspacePath, { recursive: true, force: true })
		}
	})

	it('rotates the runtime revision when a same-version local workspace plugin is refreshed', async () => {
		;(loadPlugin as jest.Mock).mockResolvedValue({
			meta: {
				name: '@xpert-ai/plugin-code-demo',
				version: '1.0.0',
				level: 'organization'
			}
		})

		const previousRuntimeName = '@xpert-ai/plugin-code-demo@runtime__previous'
		const result = await fixture.service.installPlugin({
			pluginName: '@xpert-ai/plugin-code-demo',
			source: 'code',
			sourceConfig: {
				workspacePath: '/tmp/workspaces/plugin-code-demo',
				runtimeName: previousRuntimeName
			}
		})
		expect(result).toEqual(
			expect.objectContaining({
				success: true,
				name: '@xpert-ai/plugin-code-demo'
			})
		)

		const runtimeName = (registerPluginsAsync as jest.Mock).mock.calls[0][0].plugins[0].runtimeName
		expect(runtimeName).not.toBe(previousRuntimeName)
		expect(result).toEqual(
			expect.objectContaining({
				runtimeRequirements: [
					{
						scopeKey: 'org-1',
						pluginName: '@xpert-ai/plugin-code-demo',
						version: '1.0.0',
						runtimeRevision: `runtime:${runtimeName}`,
						state: 'loaded'
					}
				]
			})
		)

		expect(runtimeName).toMatch(/^@xpert-ai\/plugin-code-demo@runtime__/)
		expect(registerPluginsAsync).toHaveBeenCalledWith(
			expect.objectContaining({
				plugins: [
					expect.objectContaining({
						name: '@xpert-ai/plugin-code-demo',
						runtimeName,
						source: 'code',
						sourceConfig: {
							workspacePath: '/tmp/workspaces/plugin-code-demo',
							runtimeName
						}
					})
				]
			}),
			expect.anything()
		)
		expect(getOrganizationPluginPath).toHaveBeenCalledWith(
			'org-1',
			runtimeName,
			expect.objectContaining({
				tenantId: 'tenant-1',
				defaultTenantId: 'tenant-1',
				scopeKey: 'org-1'
			})
		)
		expect(loadPlugin).toHaveBeenCalledWith('@xpert-ai/plugin-code-demo', {
			basedir: `/tmp/plugins/org-1/${runtimeName.replace(/[\/@]/g, '__')}`,
			source: 'code',
			workspacePath: '/tmp/workspaces/plugin-code-demo'
		})
		expect(assertPluginSdkInstallCandidate).toHaveBeenCalledWith({
			pluginName: '@xpert-ai/plugin-code-demo',
			version: undefined,
			source: 'code',
			sourceConfig: {
				workspacePath: '/tmp/workspaces/plugin-code-demo',
				runtimeName: previousRuntimeName
			}
		})
		expect(pluginInstanceService.upsert).toHaveBeenCalledWith(
			expect.objectContaining({
				source: 'code',
				sourceConfig: {
					workspacePath: '/tmp/workspaces/plugin-code-demo',
					runtimeName
				}
			})
		)
		expect(runtimeControl.recordPluginRuntimeChange).toHaveBeenCalledWith({
			pluginName: '@xpert-ai/plugin-code-demo',
			version: '1.0.0',
			runtimeRevision: `runtime:${runtimeName}`,
			scopeKey: 'org-1'
		})
	})

	it('installs uploaded plugin archives as staged code plugins without a workspace path', async () => {
		;(extractPluginArchive as jest.Mock).mockResolvedValue({
			tempDir: '/tmp/xpert-plugin-upload-abc',
			packageDir: '/tmp/xpert-plugin-upload-abc/package',
			originalName: 'plugin-uploaded-demo.tgz',
			packageJson: {
				name: '@xpert-ai/plugin-uploaded-demo',
				version: '0.2.0',
				peerDependencies: {
					'@xpert-ai/plugin-sdk': '^3.8.0'
				}
			}
		})
		;(loadPlugin as jest.Mock).mockResolvedValue({
			meta: {
				name: '@xpert-ai/plugin-uploaded-demo',
				version: '0.2.0',
				level: 'organization'
			}
		})

		await expect(
			fixture.service.installArchivePlugin({
				buffer: Buffer.from('archive'),
				originalname: 'plugin-uploaded-demo.tgz',
				mimetype: 'application/gzip',
				size: 7
			})
		).resolves.toEqual(
			expect.objectContaining({
				success: true,
				name: '@xpert-ai/plugin-uploaded-demo'
			})
		)

		const runtimeName = (registerPluginsAsync as jest.Mock).mock.calls[0][0].plugins[0].runtimeName

		expect(runtimeName).toMatch(/^@xpert-ai\/plugin-uploaded-demo@runtime__/)
		expect(readPluginPackageJson).toHaveBeenCalledWith('/tmp/xpert-plugin-upload-abc/package')
		expect(assertPluginSdkCompatibility).toHaveBeenCalledWith(
			expect.objectContaining({
				name: '@xpert-ai/plugin-uploaded-demo'
			}),
			{
				expectedPackageName: '@xpert-ai/plugin-uploaded-demo'
			}
		)
		expect(registerPluginsAsync).toHaveBeenCalledWith(
			expect.objectContaining({
				plugins: [
					expect.objectContaining({
						name: '@xpert-ai/plugin-uploaded-demo',
						runtimeName,
						source: 'code',
						sourceConfig: expect.objectContaining({
							packageDir: '/tmp/xpert-plugin-upload-abc/package',
							runtimeName,
							uploadFileName: 'plugin-uploaded-demo.tgz'
						})
					})
				]
			}),
			expect.anything()
		)
		expect(loadPlugin).toHaveBeenCalledWith('@xpert-ai/plugin-uploaded-demo', {
			basedir: `/tmp/plugins/org-1/${runtimeName.replace(/[\/@]/g, '__')}`,
			source: 'code',
			workspacePath: undefined
		})
		const upsertInput = pluginInstanceService.upsert.mock.calls.at(-1)[0]
		expect(upsertInput).toEqual(
			expect.objectContaining({
				source: 'code',
				sourceConfig: expect.objectContaining({
					runtimeName,
					uploadFileName: 'plugin-uploaded-demo.tgz'
				})
			})
		)
		expect(upsertInput.sourceConfig).not.toHaveProperty('packageDir')
		expect(cleanupExtractedPluginArchive).toHaveBeenCalledWith('/tmp/xpert-plugin-upload-abc')
	})

	it('rejects direct JSON installs that try to pass an internal packageDir', async () => {
		await expect(
			fixture.service.installPlugin({
				pluginName: '@xpert-ai/plugin-uploaded-demo',
				source: 'code',
				sourceConfig: {
					packageDir: '/tmp/xpert-plugin-upload-abc/package'
				}
			})
		).rejects.toThrow('sourceConfig.packageDir is internal')

		expect(registerPluginsAsync).not.toHaveBeenCalled()
	})

	it('refreshes code plugins from their persisted workspace path', async () => {
		loadedPlugins.push({
			organizationId: 'org-1',
			name: '@xpert-ai/plugin-code-demo',
			packageName: '@xpert-ai/plugin-code-demo',
			source: 'code',
			ctx: {
				config: {
					apiKey: 'demo'
				}
			},
			instance: {
				meta: {
					name: '@xpert-ai/plugin-code-demo',
					version: '1.0.0',
					level: 'organization'
				}
			}
		})
		pluginInstanceService.findOneByPluginName.mockResolvedValue({
			pluginName: '@xpert-ai/plugin-code-demo',
			packageName: '@xpert-ai/plugin-code-demo',
			source: 'code',
			sourceConfig: {
				workspacePath: '/tmp/workspaces/plugin-code-demo'
			},
			config: {
				apiKey: 'persisted'
			}
		})
		const installSpy = jest.spyOn(fixture.service, 'installPlugin').mockResolvedValue({
			success: true,
			name: '@xpert-ai/plugin-code-demo',
			packageName: '@xpert-ai/plugin-code-demo',
			organizationId: 'org-1',
			currentVersion: '1.0.1'
		})

		await expect(fixture.service.refreshCodePlugin('@xpert-ai/plugin-code-demo')).resolves.toEqual(
			expect.objectContaining({
				success: true,
				name: '@xpert-ai/plugin-code-demo'
			})
		)

		expect(installSpy).toHaveBeenCalledWith({
			pluginName: '@xpert-ai/plugin-code-demo',
			source: 'code',
			sourceConfig: {
				workspacePath: '/tmp/workspaces/plugin-code-demo'
			},
			config: {
				apiKey: 'demo'
			}
		})
	})

	it('rejects refreshing code plugins without a stored workspace path', async () => {
		pluginInstanceService.findOneByPluginName.mockResolvedValue({
			pluginName: '@xpert-ai/plugin-code-demo',
			packageName: '@xpert-ai/plugin-code-demo',
			source: 'code'
		})

		await expect(fixture.service.refreshCodePlugin('@xpert-ai/plugin-code-demo')).rejects.toThrow(
			'does not have a stored sourceConfig.workspacePath'
		)
	})
})
