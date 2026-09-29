import { promises as fs } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { upgradeBuiltinTemplateCatalog } from './template-catalog-upgrade'

describe('built-in template catalog upgrades', () => {
    let root: string
    let builtin: string
    let external: string
    const id = 'xpert-bosi-desktop'
    const marker = '.catalog-upgrade-bosi-desktop-v1'
    const builtinCatalog = {
        templates: {
            'en-US': { categories: ['Assistant'], recommendedApps: [{ id, title: 'Bosi' }, { id: 'unrelated' }] },
            'zh-Hans': { categories: ['Assistant'], recommendedApps: [{ id, title: 'Bosi Desktop' }] }
        },
        details: { [id]: { description: 'Built-in detail' } }
    }
    const customCatalog = {
        templates: {
            'en-US': { categories: ['Custom'], recommendedApps: [{ id: 'exported', title: 'Custom template' }] }
        },
        details: { exported: { description: 'Exported detail' }, [id]: { description: 'Custom Bosi detail' } },
        customProperty: 'preserve'
    }
    const write = (directory: string, data: unknown) =>
        fs.writeFile(join(directory, 'templates.json'), JSON.stringify(data, null, 4) + '\n')
    const read = (directory: string) => fs.readFile(join(directory, 'templates.json'), 'utf8')

    beforeEach(async () => {
        root = await fs.mkdtemp(join(tmpdir(), 'catalog-upgrade-'))
        builtin = join(root, 'builtin')
        external = join(root, 'external')
        await fs.mkdir(builtin)
        await fs.mkdir(external)
        await write(builtin, builtinCatalog)
        await write(external, customCatalog)
    })
    afterEach(async () => {
        await fs.rm(root, { recursive: true, force: true })
    })

    it('adds only introduced IDs per locale and retains custom descriptors, details and categories', async () => {
        await upgradeBuiltinTemplateCatalog(builtin, external)
        expect(JSON.parse(await read(external))).toEqual({
            ...customCatalog,
            templates: {
                'en-US': {
                    categories: ['Custom'],
                    recommendedApps: [
                        { id: 'exported', title: 'Custom template' },
                        { id, title: 'Bosi' }
                    ]
                },
                'zh-Hans': { recommendedApps: [{ id, title: 'Bosi Desktop' }] }
            }
        })
        expect(await fs.readdir(external)).toEqual(expect.arrayContaining(['templates.json', marker]))
        expect(JSON.parse(await read(builtin))).toEqual(builtinCatalog)
    })

    it('is idempotent and does not restore entries removed after the upgrade', async () => {
        await upgradeBuiltinTemplateCatalog(builtin, external)
        const upgraded = await read(external)
        await upgradeBuiltinTemplateCatalog(builtin, external)
        expect(await read(external)).toBe(upgraded)
        await write(external, customCatalog)
        await upgradeBuiltinTemplateCatalog(builtin, external)
        expect(JSON.parse(await read(external))).toEqual(customCatalog)
    })

    it('keeps existing Bosi overrides and safely resumes when catalog was written before the marker', async () => {
        const customized = {
            ...builtinCatalog,
            templates: {
                'en-US': { recommendedApps: [{ id, title: 'My Bosi' }] },
                'zh-Hans': { recommendedApps: [{ id, title: 'My local title' }] }
            }
        }
        await write(external, customized)
        const before = await read(external)
        await upgradeBuiltinTemplateCatalog(builtin, external)
        expect(await read(external)).toBe(before)
        await fs.access(join(external, marker))
    })

    it('copies missing detail metadata when adding a new descriptor', async () => {
        await write(external, { templates: {}, details: {} })
        await upgradeBuiltinTemplateCatalog(builtin, external)
        expect(JSON.parse(await read(external)).details).toEqual(builtinCatalog.details)
    })

    it('does not mutate or mark an external catalog that cannot be parsed', async () => {
        for (const content of ['{', JSON.stringify({ templates: { 'en-US': { recommendedApps: 'invalid' } } })]) {
            await fs.writeFile(join(external, 'templates.json'), content)
            await expect(upgradeBuiltinTemplateCatalog(builtin, external)).rejects.toThrow()
            expect(await read(external)).toBe(content)
            await expect(fs.access(join(external, marker))).rejects.toMatchObject({ code: 'ENOENT' })
        }
    })

    it('leaves catalogs unchanged when this distribution does not contain the introduced template', async () => {
        await write(builtin, { templates: { 'en-US': { recommendedApps: [{ id: 'another' }] } } })
        const before = await read(external)
        await upgradeBuiltinTemplateCatalog(builtin, external)
        expect(await read(external)).toBe(before)
        await expect(fs.access(join(external, marker))).rejects.toMatchObject({ code: 'ENOENT' })
    })
})
