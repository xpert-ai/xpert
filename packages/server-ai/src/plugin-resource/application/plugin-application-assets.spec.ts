import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
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

    it.each([undefined, { tagline: 'Example' }])(
        'inherits marketplace images without mutating the App',
        (presentation) => {
            const root = createPluginRoot(['./assets/cover.webp'])
            writeFileSync(join(root, 'assets/cover.webp'), Buffer.from('cover'))
            const config = { ...appConfig(), presentation }
            const marketplace = { screenshots: ['./assets/cover.webp'] }

            const resolved = resolvePluginApplicationConfigAssets(pluginRecord(root), config, marketplace)

            expect(resolved.presentation).toEqual({ ...presentation, screenshots: ['data:image/webp;base64,Y292ZXI='] })
            expect(config.presentation).toBe(presentation)
            expect(marketplace.screenshots).toEqual(['./assets/cover.webp'])
        }
    )

    it('uses an App override instead of merging marketplace screenshots', () => {
        const resolved = resolvePluginApplicationConfigAssets(pluginRecord('unused'), appConfig('/app-cover.png'), {
            screenshots: ['https://example.com/marketplace.webp']
        })
        expect(resolved.presentation?.screenshots).toEqual(['/app-cover.png'])
    })

    it('preserves an explicit empty App array as an opt-out', () => {
        const resolved = resolvePluginApplicationConfigAssets(pluginRecord('unused'), appConfig(), {
            screenshots: ['https://example.com/marketplace.webp']
        })
        expect(resolved.presentation?.screenshots).toEqual([])
    })

    it('keeps missing images absent when neither source declares them', () => {
        const config = { ...appConfig(), presentation: undefined }
        expect(resolvePluginApplicationConfigAssets(pluginRecord('unused'), config)).toBe(config)
    })

    it.each([
        'https://cdn.example.com/cover.webp',
        'http://cdn.example.com/cover.png',
        '/api/images/cover.png',
        'data:image/png;base64,Y292ZXI='
    ])('normalizes inherited browser image references: %s', (screenshot) => {
        const resolved = resolvePluginApplicationConfigAssets(
            pluginRecord('unused'),
            { ...appConfig(), presentation: undefined },
            { screenshots: [` ${screenshot} `] }
        )
        expect(resolved.presentation?.screenshots).toEqual([screenshot])
    })

    it('resolves equivalent declared relative paths through the same asset resolver', () => {
        const root = createPluginRoot(['./assets/screenshot.png'])
        writeFileSync(join(root, 'assets/screenshot.png'), Buffer.from('cover'))
        const resolved = resolvePluginApplicationConfigAssets(pluginRecord(root), appConfig('assets/screenshot.png'))
        expect(resolved.presentation?.screenshots).toEqual(['data:image/png;base64,Y292ZXI='])
    })

    it('does not follow a declared symlink outside the bundle', () => {
        const root = createPluginRoot(['./assets/cover.png'])
        const outside = createPluginRoot([])
        writeFileSync(join(outside, 'private.png'), Buffer.from('private'))
        symlinkSync(join(outside, 'private.png'), join(root, 'assets/cover.png'))
        const resolved = resolvePluginApplicationConfigAssets(pluginRecord(root), appConfig('./assets/cover.png'))
        expect(resolved.presentation?.screenshots).toEqual(['./assets/cover.png'])
    })

    it.each(['../private.png', './assets/missing.png', './assets/unsupported.txt', './assets/oversized.png'])(
        'does not inline an unsafe or unavailable inherited asset: %s',
        (screenshot) => {
            const root = createPluginRoot([screenshot])
            writeFileSync(join(root, 'assets/unsupported.txt'), Buffer.from('private'))
            writeFileSync(join(root, 'assets/oversized.png'), Buffer.alloc(5 * 1024 * 1024 + 1))
            const resolved = resolvePluginApplicationConfigAssets(
                pluginRecord(root),
                { ...appConfig(), presentation: undefined },
                { screenshots: [screenshot] }
            )
            expect(resolved.presentation?.screenshots).toEqual([screenshot])
        }
    )

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

function appConfig(screenshot?: string): PluginMarketplaceAppConfig {
    return {
        scope: 'organization',
        assistantTemplateKey: 'assistant',
        workspace: {
            mode: 'dedicated',
            name: 'Demo Workspace',
            sharing: 'organization'
        },
        presentation: { screenshots: screenshot ? [screenshot] : [] }
    }
}
