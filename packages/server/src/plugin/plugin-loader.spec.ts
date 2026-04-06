import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'

jest.mock('./plugin-sdk-versioning', () => ({
	assertInstalledPluginSdkCompatibility: jest.fn(),
	ensureHostPluginSdkLink: jest.fn()
}))

const { loadPlugin } = require('./plugin-loader')

describe('plugin loader', () => {
	let rootDir: string

	beforeEach(() => {
		rootDir = mkdtempSync(join(tmpdir(), 'xpert-plugin-loader-'))
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
	})
})

function createPluginBaseDir(rootDir: string, pluginName: string) {
	const basedir = join(rootDir, pluginName.replace(/[\/@]/g, '__'))
	const pluginDir = join(basedir, 'node_modules', ...pluginName.split('/'))
	mkdirSync(join(pluginDir, 'src'), { recursive: true })
	writeFileSync(join(basedir, 'package.json'), JSON.stringify({ name: 'plugin-base' }))
	return basedir
}
