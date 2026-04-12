import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'

jest.mock('./plugin-sdk-versioning', () => ({
	assertInstalledPluginSdkCompatibility: jest.fn(),
	ensureHostContractsLink: jest.fn(),
	ensureHostPluginSdkLink: jest.fn()
}))

const { loadPlugin } = require('./plugin-loader')
const pluginSdkVersioning = require('./plugin-sdk-versioning')

describe('plugin loader', () => {
	let rootDir: string

	beforeEach(() => {
		rootDir = mkdtempSync(join(tmpdir(), 'xpert-plugin-loader-'))
		jest.clearAllMocks()
		jest.spyOn(console, 'warn').mockImplementation(() => undefined)
		jest.spyOn(console, 'error').mockImplementation(() => undefined)
	})

	afterEach(() => {
		jest.restoreAllMocks()
		rmSync(rootDir, { recursive: true, force: true })
	})

	it('prefers staged src/index.ts for local code plugins with a workspacePath', async () => {
		const basedir = createPluginBaseDir(rootDir, '@xpert-ai/plugin-code-demo')
		const pluginDir = join(basedir, 'node_modules', '@xpert-ai', 'plugin-code-demo')
		const workspaceDir = join(rootDir, 'workspaces', 'plugin-code-demo')

		mkdirSync(join(workspaceDir, 'src'), { recursive: true })
		writeFileSync(
			join(pluginDir, 'package.json'),
			JSON.stringify({
				name: '@xpert-ai/plugin-code-demo',
				version: '1.0.0',
				main: './index.cjs',
				xpert: { plugin: { level: 'organization' } }
			})
		)
		writeFileSync(join(pluginDir, 'index.cjs'), "throw new Error('stub should not be executed')")
		writeFileSync(
			join(workspaceDir, 'src', 'index.ts'),
			[
				'const plugin = {',
				"  meta: { name: '@xpert-ai/plugin-code-demo', version: '1.0.0', level: 'organization', category: 'integration', displayName: 'Demo', description: 'Demo', author: 'Test' },",
				'  register() {',
				'    return { module: class RuntimePluginModule {} }',
				'  }',
				'}',
				'module.exports = plugin'
			].join('\n')
		)

		const plugin = await loadPlugin('@xpert-ai/plugin-code-demo', {
			basedir,
			source: 'code',
			workspacePath: workspaceDir
		})

		expect(plugin.meta.name).toBe('@xpert-ai/plugin-code-demo')
		expect(console.warn).not.toHaveBeenCalled()
	})

	it('keeps package-entry loading for uploaded plugins without a workspacePath', async () => {
		const basedir = createPluginBaseDir(rootDir, '@xpert-ai/plugin-uploaded-demo')
		const pluginDir = join(basedir, 'node_modules', '@xpert-ai', 'plugin-uploaded-demo')

		writeFileSync(
			join(pluginDir, 'package.json'),
			JSON.stringify({
				name: '@xpert-ai/plugin-uploaded-demo',
				version: '1.0.0',
				main: './index.cjs',
				xpert: { plugin: { level: 'organization' } }
			})
		)
		writeFileSync(
			join(pluginDir, 'index.cjs'),
			[
				'const plugin = {',
				"  meta: { name: '@xpert-ai/plugin-uploaded-demo', version: '1.0.0', level: 'organization', category: 'integration', displayName: 'Uploaded', description: 'Uploaded', author: 'Test' },",
				'  register() {',
				'    return { module: class RuntimePluginModule {} }',
				'  }',
				'}',
				'module.exports = plugin'
			].join('\n')
		)

		const plugin = await loadPlugin('@xpert-ai/plugin-uploaded-demo', {
			basedir,
			source: 'code'
		})

		expect(plugin.meta.name).toBe('@xpert-ai/plugin-uploaded-demo')
		expect(pluginSdkVersioning.ensureHostPluginSdkLink).toHaveBeenCalledWith(basedir)
		expect(pluginSdkVersioning.ensureHostContractsLink).toHaveBeenCalledWith(basedir)
	})

	it('skips TS source loading for local ESM workspaces and falls back to the staged package entry', async () => {
		const basedir = createPluginBaseDir(rootDir, '@xpert-ai/plugin-esm-demo')
		const pluginDir = join(basedir, 'node_modules', '@xpert-ai', 'plugin-esm-demo')
		const workspaceDir = join(rootDir, 'workspaces', 'plugin-esm-demo')

		mkdirSync(join(pluginDir, 'dist'), { recursive: true })
		mkdirSync(join(workspaceDir, 'src'), { recursive: true })
		writeFileSync(
			join(pluginDir, 'package.json'),
			JSON.stringify({
				name: '@xpert-ai/plugin-esm-demo',
				version: '1.0.0',
				type: 'module',
				main: './dist/index.cjs',
				xpert: { plugin: { level: 'organization' } }
			})
		)
		writeFileSync(
			join(pluginDir, 'dist', 'index.cjs'),
			[
				'const plugin = {',
				"  meta: { name: '@xpert-ai/plugin-esm-demo', version: '1.0.0', level: 'organization', category: 'integration', displayName: 'Staged ESM', description: 'Staged ESM', author: 'Test' },",
				'  register() {',
				'    return { module: class RuntimePluginModule {} }',
				'  }',
				'}',
				'module.exports = plugin'
			].join('\n')
		)
		writeFileSync(
			join(workspaceDir, 'package.json'),
			JSON.stringify({
				name: '@xpert-ai/plugin-esm-demo',
				type: 'module'
			})
		)
		writeFileSync(join(workspaceDir, 'src', 'index.ts'), "throw new Error('workspace source should not be executed')")

		const plugin = await loadPlugin('@xpert-ai/plugin-esm-demo', {
			basedir,
			source: 'code',
			workspacePath: workspaceDir
		})

		expect(plugin.meta.displayName).toBe('Staged ESM')
	})
})

function createPluginBaseDir(rootDir: string, pluginName: string) {
	const basedir = join(rootDir, pluginName.replace(/[\/@]/g, '__'))
	const pluginDir = join(basedir, 'node_modules', ...pluginName.split('/'))
	mkdirSync(join(pluginDir, 'src'), { recursive: true })
	writeFileSync(join(basedir, 'package.json'), JSON.stringify({ name: 'plugin-base' }))
	return basedir
}
