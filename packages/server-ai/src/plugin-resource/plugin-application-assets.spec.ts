import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { PluginMarketplaceAppConfig } from '@xpert-ai/contracts'
import { resolvePluginApplicationConfigAssets } from './plugin-application-assets'

describe('resolvePluginApplicationConfigAssets', () => {
    const roots: string[] = []

    afterEach(() => {
        for (const root of roots) {
            rmSync(root, { recursive: true, force: true })
        }
        roots.length = 0
    })

    it('inlines a screenshot declared by the portable plugin manifest', () => {
        const root = createPluginRoot(['./assets/screenshot.png'])
        writeFileSync(
            join(root, 'assets', 'screenshot.png'),
            Buffer.from(
                'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
                'base64'
            )
        )

        const resolved = resolvePluginApplicationConfigAssets(pluginRecord(root), appConfig('./assets/screenshot.png'))

        expect(resolved.presentation?.screenshots?.[0]).toMatch(/^data:image\/png;base64,/)
    })

    it('does not read an undeclared local file', () => {
        const root = createPluginRoot([])
        writeFileSync(join(root, 'assets', 'private.png'), Buffer.from('private'))

        const resolved = resolvePluginApplicationConfigAssets(pluginRecord(root), appConfig('./assets/private.png'))

        expect(resolved.presentation?.screenshots).toEqual(['./assets/private.png'])
    })

    it('keeps remote screenshot URLs unchanged', () => {
        const root = createPluginRoot([])
        const screenshot = 'https://cdn.example.com/application.webp'

        const resolved = resolvePluginApplicationConfigAssets(pluginRecord(root), appConfig(screenshot))

        expect(resolved.presentation?.screenshots).toEqual([screenshot])
    })

    function createPluginRoot(screenshots: string[]) {
        const root = mkdtempSync(join(tmpdir(), 'plugin-application-assets-'))
        roots.push(root)
        mkdirSync(join(root, '.xpertai-plugin'), { recursive: true })
        mkdirSync(join(root, 'assets'), { recursive: true })
        writeFileSync(
            join(root, '.xpertai-plugin', 'plugin.json'),
            JSON.stringify({
                name: '@xpert-ai/plugin-demo',
                assets: { screenshots }
            })
        )
        return root
    }
})

function pluginRecord(root: string) {
    return {
        organizationId: '__global__',
        name: '@xpert-ai/plugin-demo',
        packageName: '@xpert-ai/plugin-demo',
        baseDir: root,
        instance: {},
        ctx: {}
    }
}

function appConfig(screenshot: string): PluginMarketplaceAppConfig {
    return {
        scope: 'organization',
        assistantTemplateKey: 'assistant',
        workspace: {
            mode: 'dedicated',
            name: 'Demo Workspace',
            sharing: 'organization'
        },
        presentation: { screenshots: [screenshot] }
    }
}
