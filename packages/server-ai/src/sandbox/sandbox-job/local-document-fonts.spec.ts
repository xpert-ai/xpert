import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { localDocumentFontEnvironment } from './local-document-fonts'

describe('Local document runtime fonts', () => {
    const roots: string[] = []
    afterEach(async () => {
        await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
    })

    it('provides isolated macOS font discovery and Songti fallback without changing the input environment', async () => {
        const root = await temporaryRoot()
        const environment = { HOME: '/Users/example & user', PATH: '/usr/bin' }
        const result = await localDocumentFontEnvironment(root, environment, 'darwin')
        expect(result.FONTCONFIG_FILE).toBe(path.join(root, 'runtime/fontconfig/fonts.conf'))
        const config = await readFile(result.FONTCONFIG_FILE!, 'utf8')
        expect(config).toContain('<dir>/System/Library/Fonts</dir>')
        expect(config).toContain('<dir>/Users/example &amp; user/Library/Fonts</dir>')
        expect(config).toContain('<family>宋体</family>')
        expect(config).toContain('<family>Songti SC</family>')
        expect(config).toContain(path.join(root, 'runtime/fontconfig/cache'))
        expect(environment).toEqual({ HOME: '/Users/example & user', PATH: '/usr/bin' })

        const other = await localDocumentFontEnvironment(await temporaryRoot(), environment, 'darwin')
        expect(other.FONTCONFIG_FILE).not.toBe(result.FONTCONFIG_FILE)
    })

    it.each([{ FONTCONFIG_FILE: '/custom/fonts.conf' }, { FONTCONFIG_PATH: '/custom/fonts' }])(
        'respects explicit runtime font configuration %o',
        async (environment) => {
            const root = await temporaryRoot()
            expect(await localDocumentFontEnvironment(root, environment, 'darwin')).toBe(environment)
            expect(await readdir(root)).toEqual([])
        }
    )

    it.each(['linux', 'win32'] as const)('preserves %s runtime font discovery', async (platform) => {
        const root = await temporaryRoot()
        const environment = { PATH: '/usr/bin' }
        expect(await localDocumentFontEnvironment(root, environment, platform)).toBe(environment)
        expect(await readdir(root)).toEqual([])
    })

    async function temporaryRoot() {
        const root = await mkdtemp(path.join(tmpdir(), 'xpert-document-fonts-'))
        roots.push(root)
        return root
    }
})
