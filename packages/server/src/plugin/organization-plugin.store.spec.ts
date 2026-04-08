import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'

jest.mock('@metad/server-config', () => ({
	getConfig: () => ({
		assetOptions: {
			serverRoot: '/tmp/xpert'
		}
	})
}))

const { stageWorkspacePlugin } = require('./organization-plugin.store')

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

		expect(() =>
			stageWorkspacePlugin({
				organizationId: 'org-1',
				pluginName: '@xpert-ai/plugin-lark',
				expectedPackageName: '@xpert-ai/plugin-lark',
				workspacePath: workspaceRoot,
				rootDir: pluginRoot
			})
		).toThrow(
			`Plugin "@xpert-ai/plugin-lark" (expected package "@xpert-ai/plugin-lark") has an invalid workspacePath "${workspaceRoot}"`
		)
	})
})
