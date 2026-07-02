import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'

jest.mock('@xpert-ai/server-config', () => ({
	getConfig: () => ({
		assetOptions: {
			serverRoot: '/tmp/xpert'
		}
	})
}))

jest.mock('@xpert-ai/plugin-sdk', () => ({
	GLOBAL_ORGANIZATION_SCOPE: 'global',
	SYSTEM_GLOBAL_SCOPE: 'system:global',
	TENANT_GLOBAL_SCOPE_PREFIX: 'tenant:',
	TENANT_GLOBAL_SCOPE_SUFFIX: ':global',
	getTenantGlobalScopeKey: (tenantId: string) => `tenant:${tenantId}:global`,
	isTenantGlobalScopeKey: (value?: string | null) =>
		typeof value === 'string' && value.startsWith('tenant:') && value.endsWith(':global')
}))

const { getOrganizationPluginRoot, stageWorkspacePlugin } = require('./organization-plugin.store')

describe('organization-plugin.store', () => {
	const originalWorkspaceRoots = process.env.PLUGIN_WORKSPACE_ROOTS
	let tempRoot: string
	let workspaceRoot: string
	let pluginRoot: string

	beforeEach(() => {
		tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'xpert-plugin-store-'))
		workspaceRoot = path.join(tempRoot, 'workspace', 'plugin-lark')
		pluginRoot = path.join(tempRoot, 'plugins')

		fs.mkdirSync(path.join(workspaceRoot, 'dist'), { recursive: true })
		fs.writeFileSync(
			path.join(workspaceRoot, 'package.json'),
			JSON.stringify({ name: '@xpert-ai/plugin-lark', version: '0.0.1' }, null, 2)
		)
		fs.writeFileSync(path.join(workspaceRoot, 'dist', 'index.js'), 'module.exports = {}\n')
		process.env.PLUGIN_WORKSPACE_ROOTS = fs.realpathSync(path.join(tempRoot, 'workspace'))
	})

	afterEach(() => {
		if (originalWorkspaceRoots == null) {
			delete process.env.PLUGIN_WORKSPACE_ROOTS
		} else {
			process.env.PLUGIN_WORKSPACE_ROOTS = originalWorkspaceRoots
		}
		fs.rmSync(tempRoot, { recursive: true, force: true })
	})

	it('keeps the Default Tenant global plugins in the legacy global folder', () => {
		expect(
			getOrganizationPluginRoot('global', {
				rootDir: pluginRoot,
				tenantId: 'tenant-default',
				defaultTenantId: 'tenant-default'
			})
		).toBe(path.join(pluginRoot, 'global'))
	})

	it('stores non-default tenant global plugins in a tenant-isolated folder', () => {
		expect(
			getOrganizationPluginRoot('global', {
				rootDir: pluginRoot,
				tenantId: 'tenant-other',
				defaultTenantId: 'tenant-default'
			})
		).toBe(path.join(pluginRoot, 'tenants', 'tenant-other', 'global'))
	})

	it('keeps organization plugin paths unchanged', () => {
		expect(
			getOrganizationPluginRoot('org-1', {
				rootDir: pluginRoot,
				tenantId: 'tenant-other',
				defaultTenantId: 'tenant-default'
			})
		).toBe(path.join(pluginRoot, 'org-1'))
	})

	it('stores system plugins in a singleton system folder', () => {
		expect(
			getOrganizationPluginRoot('global', {
				rootDir: pluginRoot,
				tenantId: 'tenant-other',
				defaultTenantId: 'tenant-default',
				scopeKey: 'system:global'
			})
		).toBe(path.join(pluginRoot, 'system_global'))
	})

	it('copies the workspace by default', () => {
		const pluginDir = stageWorkspacePlugin({
			organizationId: 'org-1',
			pluginName: '@xpert-ai/plugin-lark',
			expectedPackageName: '@xpert-ai/plugin-lark',
			workspacePath: workspaceRoot,
			rootDir: pluginRoot
		})

		const targetPackageDir = path.join(pluginDir, 'node_modules', '@xpert-ai', 'plugin-lark')
		expect(fs.lstatSync(targetPackageDir).isSymbolicLink()).toBe(false)
		expect(fs.existsSync(path.join(targetPackageDir, 'dist', 'index.js'))).toBe(true)
	})

	it('copies monorepo build output beside the staged package for root index.cjs wrappers', () => {
		const monorepoDist = path.join(tempRoot, 'workspace', 'dist', 'plugin-lark')
		fs.mkdirSync(monorepoDist, { recursive: true })
		fs.writeFileSync(path.join(monorepoDist, 'index.cjs.js'), 'module.exports = { compiled: true }\n')

		const pluginDir = stageWorkspacePlugin({
			organizationId: 'org-1',
			pluginName: '@xpert-ai/plugin-lark',
			expectedPackageName: '@xpert-ai/plugin-lark',
			workspacePath: workspaceRoot,
			rootDir: pluginRoot
		})

		expect(fs.existsSync(path.join(pluginDir, 'dist', 'plugin-lark', 'index.cjs.js'))).toBe(true)
	})

	it('resolves Nx outputPath from the monorepo root when allowed roots point at packages/plugins', () => {
		const monorepoRoot = path.join(tempRoot, 'monorepo')
		const pluginsRoot = path.join(monorepoRoot, 'packages', 'plugins')
		workspaceRoot = path.join(pluginsRoot, 'plugin-lark')

		fs.mkdirSync(path.join(workspaceRoot, 'src'), { recursive: true })
		process.env.PLUGIN_WORKSPACE_ROOTS = fs.realpathSync(pluginsRoot)
		fs.writeFileSync(path.join(monorepoRoot, 'nx.json'), '{}\n')
		fs.writeFileSync(path.join(monorepoRoot, 'package.json'), JSON.stringify({ name: 'xpert-test' }, null, 2))
		fs.writeFileSync(
			path.join(workspaceRoot, 'package.json'),
			JSON.stringify({ name: '@xpert-ai/plugin-lark', version: '0.0.1' }, null, 2)
		)
		fs.writeFileSync(path.join(workspaceRoot, 'src', 'index.ts'), 'export default {}\n')
		fs.writeFileSync(
			path.join(workspaceRoot, 'project.json'),
			JSON.stringify(
				{
					name: 'plugin-lark',
					targets: {
						build: {
							options: {
								outputPath: 'dist/packages/plugins/plugin-lark'
							}
						}
					}
				},
				null,
				2
			)
		)
		const monorepoDist = path.join(monorepoRoot, 'dist', 'packages', 'plugins', 'plugin-lark')
		fs.mkdirSync(monorepoDist, { recursive: true })
		fs.writeFileSync(path.join(monorepoDist, 'index.cjs.js'), 'module.exports = { compiled: true }\n')

		const pluginDir = stageWorkspacePlugin({
			organizationId: 'org-1',
			pluginName: '@xpert-ai/plugin-lark',
			expectedPackageName: '@xpert-ai/plugin-lark',
			workspacePath: workspaceRoot,
			rootDir: pluginRoot
		})

		expect(fs.existsSync(path.join(pluginDir, 'dist', 'packages', 'plugins', 'plugin-lark', 'index.cjs.js'))).toBe(
			true
		)
	})

	it('does not build missing Nx workspace plugin output during staging', () => {
		fs.rmSync(path.join(tempRoot, 'workspace', 'dist'), { recursive: true, force: true })
		fs.mkdirSync(path.join(workspaceRoot, 'src'), { recursive: true })
		fs.writeFileSync(path.join(workspaceRoot, 'src', 'index.ts'), 'export default {}\n')
		fs.writeFileSync(
			path.join(workspaceRoot, 'project.json'),
			JSON.stringify({
				name: 'plugin-lark',
				targets: {
					build: {
						options: {
							outputPath: 'dist/plugin-lark'
						}
					}
				}
			})
		)

		const pluginDir = stageWorkspacePlugin({
			organizationId: 'org-1',
			pluginName: '@xpert-ai/plugin-lark',
			expectedPackageName: '@xpert-ai/plugin-lark',
			workspacePath: workspaceRoot,
			rootDir: pluginRoot
		})

		expect(fs.existsSync(path.join(pluginDir, 'dist', 'plugin-lark', 'index.cjs.js'))).toBe(false)
		expect(fs.existsSync(path.join(pluginDir, 'node_modules', '@xpert-ai', 'plugin-lark', 'src', 'index.ts'))).toBe(
			true
		)
	})

	it('rejects Nx build output paths outside the workspace root', () => {
		fs.rmSync(path.join(tempRoot, 'workspace', 'dist'), { recursive: true, force: true })
		fs.mkdirSync(path.join(workspaceRoot, 'src'), { recursive: true })
		fs.writeFileSync(path.join(workspaceRoot, 'src', 'index.ts'), 'export default {}\n')
		fs.writeFileSync(
			path.join(workspaceRoot, 'project.json'),
			JSON.stringify({
				name: 'plugin-lark',
				targets: {
					build: {
						options: {
							outputPath: '../outside-dist/plugin-lark'
						}
					}
				}
			})
		)

		expect(() =>
			stageWorkspacePlugin({
				organizationId: 'org-1',
				pluginName: '@xpert-ai/plugin-lark',
				expectedPackageName: '@xpert-ai/plugin-lark',
				workspacePath: workspaceRoot,
				rootDir: pluginRoot
			})
		).toThrow(/resolves outside workspace root/)
	})

	it('keeps staged code plugins loadable when they declare runtime dependencies', () => {
		const runtimeDependencyRoot = path.join(tempRoot, 'workspace', 'runtime-dependency')
		fs.mkdirSync(runtimeDependencyRoot, { recursive: true })
		fs.writeFileSync(
			path.join(runtimeDependencyRoot, 'package.json'),
			JSON.stringify(
				{
					name: 'xpert-runtime-dependency',
					version: '1.0.0',
					main: './index.js'
				},
				null,
				2
			)
		)
		fs.writeFileSync(
			path.join(runtimeDependencyRoot, 'index.js'),
			"module.exports = { runtimeDependencyName: 'xpert-runtime-dependency' }\n"
		)
		fs.writeFileSync(
			path.join(workspaceRoot, 'package.json'),
			JSON.stringify(
				{
					name: '@xpert-ai/plugin-lark',
					version: '0.0.1',
					main: './dist/index.js',
					dependencies: {
						'xpert-runtime-dependency': `file:${runtimeDependencyRoot}`
					},
					devDependencies: {
						'xpert-dev-only': `file:${path.join(tempRoot, 'missing-dev-only')}`
					},
					peerDependencies: {
						'xpert-peer-only': '*'
					}
				},
				null,
				2
			)
		)
		fs.writeFileSync(
			path.join(workspaceRoot, 'dist', 'index.js'),
			["const dependency = require('xpert-runtime-dependency')", 'module.exports = dependency'].join('\n')
		)

		const pluginDir = stageWorkspacePlugin({
			organizationId: 'org-1',
			pluginName: '@xpert-ai/plugin-lark',
			expectedPackageName: '@xpert-ai/plugin-lark',
			workspacePath: workspaceRoot,
			rootDir: pluginRoot
		})
		const stagedEntry = path.join(pluginDir, 'node_modules', '@xpert-ai', 'plugin-lark', 'dist', 'index.js')
		const stagedNodeModules = path.join(pluginDir, 'node_modules', '@xpert-ai', 'plugin-lark', 'node_modules')
		const stagedPackageJson = JSON.parse(
			fs.readFileSync(path.join(pluginDir, 'node_modules', '@xpert-ai', 'plugin-lark', 'package.json'), 'utf8')
		)

		expect(require(stagedEntry)).toEqual({
			runtimeDependencyName: 'xpert-runtime-dependency'
		})
		expect(fs.existsSync(path.join(stagedNodeModules, 'xpert-runtime-dependency'))).toBe(true)
		expect(fs.existsSync(path.join(stagedNodeModules, 'xpert-dev-only'))).toBe(false)
		expect(fs.existsSync(path.join(stagedNodeModules, 'xpert-peer-only'))).toBe(false)
		expect(stagedPackageJson.devDependencies).toEqual({
			'xpert-dev-only': `file:${path.join(tempRoot, 'missing-dev-only')}`
		})
		expect(stagedPackageJson.peerDependencies).toEqual({
			'xpert-peer-only': '*'
		})
	})

	it('rejects workspace paths outside allowed roots', () => {
		process.env.PLUGIN_WORKSPACE_ROOTS = path.join(tempRoot, 'allowed')

		expect(() =>
			stageWorkspacePlugin({
				organizationId: 'org-1',
				pluginName: '@xpert-ai/plugin-lark',
				expectedPackageName: '@xpert-ai/plugin-lark',
				workspacePath: workspaceRoot,
				rootDir: pluginRoot
			})
		).toThrow(/outside allowed roots/)
	})

	it('rejects workspace package name mismatches', () => {
		fs.writeFileSync(
			path.join(workspaceRoot, 'package.json'),
			JSON.stringify({ name: '@xpert-ai/plugin-other', version: '0.0.1' }, null, 2)
		)

		expect(() =>
			stageWorkspacePlugin({
				organizationId: 'org-1',
				pluginName: '@xpert-ai/plugin-lark',
				expectedPackageName: '@xpert-ai/plugin-lark',
				workspacePath: workspaceRoot,
				rootDir: pluginRoot
			})
		).toThrow(/workspace package name mismatch/)
	})

	it('accepts a precompiled root entry without dist or src/index.ts', () => {
		fs.rmSync(path.join(workspaceRoot, 'dist'), { recursive: true, force: true })
		fs.writeFileSync(path.join(workspaceRoot, 'index.cjs.js'), 'module.exports = {}\n')

		const pluginDir = stageWorkspacePlugin({
			organizationId: 'org-1',
			pluginName: '@xpert-ai/plugin-lark',
			expectedPackageName: '@xpert-ai/plugin-lark',
			workspacePath: workspaceRoot,
			rootDir: pluginRoot
		})

		const targetPackageDir = path.join(pluginDir, 'node_modules', '@xpert-ai', 'plugin-lark')
		expect(fs.existsSync(path.join(targetPackageDir, 'index.cjs.js'))).toBe(true)
	})

	it('includes plugin details when workspacePath is not loadable', () => {
		fs.rmSync(path.join(workspaceRoot, 'dist'), { recursive: true, force: true })
		const realWorkspaceRoot = fs.realpathSync.native(workspaceRoot)

		expect(() =>
			stageWorkspacePlugin({
				organizationId: 'org-1',
				pluginName: '@xpert-ai/plugin-lark',
				expectedPackageName: '@xpert-ai/plugin-lark',
				workspacePath: workspaceRoot,
				rootDir: pluginRoot
			})
		).toThrow(
			`Plugin "@xpert-ai/plugin-lark" (expected package "@xpert-ai/plugin-lark") has an invalid workspacePath "${realWorkspaceRoot}"`
		)
	})
})
