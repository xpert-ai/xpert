import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { PLUGIN_COMPONENT_TYPE, PluginComponentType } from '@xpert-ai/contracts'
import {
	collectPluginBundleComponents,
	readPluginBundleManifest,
	resolveLoadedPluginBundleRoot
} from './plugin-bundle-manifest'

function createPluginRoot() {
	return mkdtempSync(join(tmpdir(), 'xpert-plugin-bundle-'))
}

function writeJson(filePath: string, value: unknown) {
	writeFileSync(filePath, JSON.stringify(value, null, 2))
}

describe('plugin bundle manifest', () => {
	let root: string

	afterEach(() => {
		if (root) {
			rmSync(root, { recursive: true, force: true })
		}
	})

	it('reads Codex-style manifest components', () => {
		root = createPluginRoot()
		mkdirSync(join(root, '.xpertai-plugin'), { recursive: true })
		mkdirSync(join(root, 'assets'), { recursive: true })
		mkdirSync(join(root, 'skills', 'hello'), { recursive: true })
		mkdirSync(join(root, 'hooks'), { recursive: true })
		writeFileSync(
			join(root, 'skills', 'hello', 'SKILL.md'),
			['---', 'name: hello', 'description: Say hello.', '---', '', 'Greet the user.'].join('\n')
		)
		writeJson(join(root, 'mcp.json'), {
			docs: {
				command: 'docs-mcp',
				args: ['--stdio']
			}
		})
		writeJson(join(root, '.app.json'), {
			name: 'drive',
			auth: {
				type: 'oauth'
			}
		})
		writeJson(join(root, 'hooks', 'hooks.json'), {
			hooks: {
				SessionStart: [
					{
						hooks: [
							{
								type: 'command',
								command: 'node ${PLUGIN_ROOT}/hooks/start.js'
							}
						]
					}
				]
			}
		})
		writeFileSync(join(root, 'assets', 'composer-icon.svg'), '<svg xmlns="http://www.w3.org/2000/svg"></svg>')
		writeJson(join(root, '.xpertai-plugin', 'plugin.json'), {
			name: 'xpertai-helper',
			version: '1.0.0',
			description: 'Reusable workflow',
			artifactNamespace: 'xpertai_helper',
			skills: './skills',
			mcpServers: './mcp.json',
			apps: './.app.json',
			hooks: './hooks/hooks.json',
			interface: {
				displayName: 'XpertAI Helper',
				defaultPrompt: ['Use XpertAI Helper to summarize notes.'],
				brandColor: '#2563EB'
			},
			targetAppMeta: {
				xpert: {
					marketplace: {
						contents: [
							{
								type: 'skill',
								name: 'hello',
								displayName: 'Hello Skill',
								icon: {
									type: 'svg',
									value: '<svg viewBox="0 0 16 16"></svg>'
								},
								color: '#F04438'
							}
						]
					}
				}
			},
			assets: {
				composerIcon: './assets/composer-icon.svg'
			}
		})

		const manifest = readPluginBundleManifest(root)
		if (!manifest) {
			throw new Error('Expected manifest')
		}
		expect(manifest?.manifest.name).toBe('xpertai-helper')
		expect(manifest?.manifest.artifactNamespace).toBe('xpertai_helper')
		expect(manifest?.manifest.interface?.displayName).toBe('XpertAI Helper')

		const components = collectPluginBundleComponents(root, manifest.manifest)
		expect(components).toHaveLength(5)
		expect(components.find((item) => item.componentType === PLUGIN_COMPONENT_TYPE.SKILL)?.componentKey).toBe(
			'hello'
		)
		expect(components.find((item) => item.componentType === PLUGIN_COMPONENT_TYPE.SKILL)?.metadata).toEqual({
			name: 'hello',
			displayName: 'Hello Skill',
			icon: {
				type: 'svg',
				value: '<svg viewBox="0 0 16 16"></svg>'
			},
			color: '#F04438'
		})
		expect(components.find((item) => item.componentType === PLUGIN_COMPONENT_TYPE.MCP_SERVER)?.componentKey).toBe(
			'docs'
		)
		expect(components.find((item) => item.componentType === PLUGIN_COMPONENT_TYPE.APP)?.componentKey).toBe('drive')
		expect(components.find((item) => item.componentType === PLUGIN_COMPONENT_TYPE.ASSET)?.sourcePath).toBe(
			'./assets/composer-icon.svg'
		)
	})

	it('expands Codex app maps into individual app components', () => {
		root = createPluginRoot()
		mkdirSync(join(root, '.xpertai-plugin'), { recursive: true })
		writeJson(join(root, '.app.json'), {
			apps: {
				slack: {
					id: 'REPLACE_WITH_SLACK_APP_OR_CONNECTOR_ID'
				},
				teams: {
					id: 'connector_246af0940da3457da0e751171dc1ce60',
					optional: true
				}
			}
		})
		writeJson(join(root, '.xpertai-plugin', 'plugin.json'), {
			name: 'role-helper',
			apps: './.app.json'
		})

		const manifest = readPluginBundleManifest(root)
		if (!manifest) {
			throw new Error('Expected manifest')
		}

		const components = collectPluginBundleComponents(root, manifest.manifest)
		const apps = components.filter((item) => item.componentType === PLUGIN_COMPONENT_TYPE.APP)

		expect(apps.map((item) => item.componentKey).sort()).toEqual(['slack', 'teams'])
		expect(apps.find((item) => item.componentKey === 'slack')?.config).toEqual({
			id: 'REPLACE_WITH_SLACK_APP_OR_CONNECTOR_ID'
		})
		expect(apps.find((item) => item.componentKey === 'teams')?.config).toEqual({
			id: 'connector_246af0940da3457da0e751171dc1ce60',
			optional: true
		})
	})

	it('collects XpertAI Browser Lab as the validation bundle', () => {
		const pluginRoot = resolve(__dirname, '../../../plugins/xpertai-browser-lab')
		const manifest = readPluginBundleManifest(pluginRoot)
		if (!manifest) {
			throw new Error('Expected XpertAI Browser Lab manifest')
		}

		expect(manifest.manifest.name).toBe('@xpert-ai/plugin-xpertai-browser-lab')
		expect(manifest.manifest.skills).toBe('./skills')
		expect(manifest.manifest.mcpServers).toBe('./mcp.json')
		expect(manifest.manifest.apps).toBe('./apps')
		expect(manifest.manifest.hooks).toBe('./hooks/hooks.json')

		const components = collectPluginBundleComponents(pluginRoot, manifest.manifest)
		const identities = components.map((item) => `${item.componentType}:${item.componentKey}`).sort()

		expect(identities).toEqual([
			'app:xpertai-browser-session',
			'asset:composerIcon:./assets/composer-icon.svg',
			'asset:logo:./assets/logo.svg',
			'asset:screenshot:./assets/screenshot.svg',
			'hook:hooks',
			'mcp_server:xpertai-browser-lab',
			'skill:browser-research'
		])
		expect(components.find((item) => item.componentType === PLUGIN_COMPONENT_TYPE.SKILL)?.sourcePath).toBe(
			'./skills/browser-research/SKILL.md'
		)
	})

	it('collects role-specific Codex plugin bundles', () => {
		const expected = [
			{
				root: '../../../plugins/xpertai-sales',
				name: '@xpert-ai/plugin-xpertai-sales',
				skills: 20,
				apps: 29,
				mcpServers: 0
			},
			{
				root: '../../../plugins/xpertai-data-analytics',
				name: '@xpert-ai/plugin-xpertai-data-analytics',
				skills: 15,
				apps: 21,
				mcpServers: 1
			},
			{
				root: '../../../plugins/xpertai-product-design',
				name: '@xpert-ai/plugin-xpertai-product-design',
				skills: 11,
				apps: 1,
				mcpServers: 0
			},
			{
				root: '../../../plugins/xpertai-financial-markets',
				name: '@xpert-ai/plugin-xpertai-financial-markets',
				skills: 23,
				apps: 15,
				mcpServers: 0
			}
		]

		for (const item of expected) {
			const pluginRoot = resolve(__dirname, item.root)
			const manifest = readPluginBundleManifest(pluginRoot)
			if (!manifest) {
				throw new Error(`Expected manifest for ${item.name}`)
			}

			expect(manifest.manifest.name).toBe(item.name)

			const components = collectPluginBundleComponents(pluginRoot, manifest.manifest)
			expect(countComponents(components, PLUGIN_COMPONENT_TYPE.SKILL)).toBe(item.skills)
			expect(countComponents(components, PLUGIN_COMPONENT_TYPE.APP)).toBe(item.apps)
			expect(countComponents(components, PLUGIN_COMPONENT_TYPE.MCP_SERVER)).toBe(item.mcpServers)
		}

		const dataAnalyticsRoot = resolve(__dirname, '../../../plugins/xpertai-data-analytics')
		const dataAnalyticsManifest = readPluginBundleManifest(dataAnalyticsRoot)
		if (!dataAnalyticsManifest) {
			throw new Error('Expected Data Analytics manifest')
		}
		const dataAnalyticsComponents = collectPluginBundleComponents(dataAnalyticsRoot, dataAnalyticsManifest.manifest)
		expect(
			dataAnalyticsComponents.find((item) => item.componentType === PLUGIN_COMPONENT_TYPE.MCP_SERVER)
				?.componentKey
		).toBe('datascienceWidgets')
	})

	it('resolves loaded code plugin bundle roots from sourceConfig when staged roots have no manifest', () => {
		const stagedRoot = createPluginRoot()
		root = createPluginRoot()
		mkdirSync(join(root, '.xpertai-plugin'), { recursive: true })
		mkdirSync(join(root, 'skills', 'browser-research'), { recursive: true })
		writeJson(join(root, '.xpertai-plugin', 'plugin.json'), {
			name: '@xpert-ai/plugin-xpertai-browser-lab',
			version: '0.1.0',
			skills: './skills'
		})
		writeFileSync(
			join(root, 'skills', 'browser-research', 'SKILL.md'),
			[
				'---',
				'name: browser-research',
				'description: Browser research.',
				'---',
				'',
				'Use browser evidence.'
			].join('\n')
		)

		try {
			expect(
				resolveLoadedPluginBundleRoot({
					name: '@xpert-ai/plugin-xpertai-browser-lab',
					packageName: '@xpert-ai/plugin-xpertai-browser-lab',
					baseDir: stagedRoot,
					sourceConfig: {
						workspacePath: root
					}
				})
			).toBe(root)
		} finally {
			rmSync(stagedRoot, { recursive: true, force: true })
		}
	})

	it('uses default hooks file when hooks field is omitted', () => {
		root = createPluginRoot()
		mkdirSync(join(root, '.xpertai-plugin'), { recursive: true })
		mkdirSync(join(root, 'hooks'), { recursive: true })
		writeJson(join(root, '.xpertai-plugin', 'plugin.json'), {
			name: 'xpert-helper'
		})
		writeJson(join(root, 'hooks', 'hooks.json'), {
			hooks: {
				SessionStart: []
			}
		})

		const manifest = readPluginBundleManifest(root)
		if (!manifest) {
			throw new Error('Expected manifest')
		}
		const components = collectPluginBundleComponents(root, manifest.manifest)

		expect(components).toHaveLength(1)
		expect(components[0].componentType).toBe(PLUGIN_COMPONENT_TYPE.HOOK)
		expect(components[0].sourcePath).toBe('./hooks/hooks.json')
	})

	it('ignores manifest component paths outside the plugin root', () => {
		root = createPluginRoot()
		mkdirSync(join(root, '.xpertai-plugin'), { recursive: true })
		writeJson(join(root, '.xpertai-plugin', 'plugin.json'), {
			name: 'unsafe-helper',
			skills: '../outside'
		})

		const manifest = readPluginBundleManifest(root)
		if (!manifest) {
			throw new Error('Expected manifest')
		}
		const components = collectPluginBundleComponents(root, manifest.manifest)

		expect(components).toHaveLength(0)
	})
})

function countComponents(
	components: Array<{ componentType: PluginComponentType }>,
	componentType: PluginComponentType
) {
	return components.filter((item) => item.componentType === componentType).length
}
