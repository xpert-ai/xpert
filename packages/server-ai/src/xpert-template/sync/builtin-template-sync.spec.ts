import { promises as fs } from 'node:fs'
import { join } from 'node:path'
import { LanguagesEnum } from '@xpert-ai/contracts'
import {
    cleanupTemplateFixtures,
    createService,
    createTempDir,
    seedBuiltinTemplates
} from '../testing/template-test-harness'
import { syncBuiltinTemplates } from './builtin-template-sync'
import { hashContent, readSyncManifest, syncManifestName } from './template-sync-state'

let server: string
let data: string
let builtin: string
let external: string
const asset = 'templates/template-1.yaml'
const catalog = (name: string, extra = false) => ({
    templates: {
        'en-US': {
            categories: ['builtin'],
            recommendedApps: [{ id: 'template-1', name }, ...(extra ? [{ id: 'template-2', name: 'New' }] : [])]
        }
    },
    details: { 'template-1': { description: name } }
})
const write = (root: string, file: string, content: string) => fs.writeFile(join(root, file), content)
const read = (file: string) => fs.readFile(join(external, file), 'utf8')
const sync = () => syncBuiltinTemplates(builtin, external)

beforeEach(async () => {
    server = createTempDir()
    data = createTempDir()
    builtin = seedBuiltinTemplates(server, { templatesJson: catalog('Original') })
    external = join(data, 'xpert-template')
    await fs.mkdir(external)
    external = await fs.realpath(external)
})
afterEach(cleanupTemplateFixtures)

it('updates unchanged assets across image upgrades and serves the new YAML to subsequent installations', async () => {
    await sync()
    await write(builtin, asset, 'source: upgraded\n')
    const result = await sync()
    expect(result.updated).toContain(asset)
    expect(await read(asset)).toBe('source: upgraded\n')
    const { service } = createService({ serverRoot: server, dataPath: data })
    const detail = await service.getTemplateDetail('template-1', LanguagesEnum.English)
    expect(detail.export_data).toBe('source: upgraded\n')
    expect((await readSyncManifest(external))?.files[asset].hash).toBe(hashContent('source: upgraded\n'))
})

it('initializes the actual bundled catalog and assets and leaves a second startup unchanged', async () => {
    builtin = join(__dirname, '..')
    const result = await sync()
    expect(result.conflicted).toEqual([])
    expect(JSON.parse(await read('templates.json'))).toEqual(
        JSON.parse(await fs.readFile(join(builtin, 'templates.json'), 'utf8'))
    )
    expect(await read('templates/xpert-my-claw-xpert.yaml')).toBe(
        await fs.readFile(join(builtin, 'templates/xpert-my-claw-xpert.yaml'), 'utf8')
    )
    const again = await sync()
    expect(again.added).toEqual([])
    expect(again.updated).toEqual([])
    expect(again.conflicted).toEqual([])
})

it('preserves local edits and keeps the last synchronized baseline across repeated upgrades', async () => {
    await sync()
    const baseline = (await readSyncManifest(external))?.files[asset].hash
    await write(external, asset, 'local: true\n')
    for (const version of ['v2', 'v3']) {
        await write(builtin, asset, version)
        expect((await sync()).conflicted).toContain(asset)
        expect(await read(asset)).toBe('local: true\n')
        expect((await readSyncManifest(external))?.files[asset].hash).toBe(baseline)
    }
})

it('adopts identical legacy assets, but never assumes a different legacy file is unmodified', async () => {
    await fs.mkdir(join(external, 'templates'))
    await write(external, asset, 'old-or-custom\n')
    await fs.copyFile(join(builtin, 'workspace-defaults.yaml'), join(external, 'workspace-defaults.yaml'))
    const result = await sync()
    expect(result.conflicted).toContain(asset)
    expect(result.adopted).toContain('workspace-defaults.yaml')
    await write(builtin, asset, 'v3')
    await sync()
    expect(await read(asset)).toBe('old-or-custom\n')
    // Explicitly accepting the bundled version enrolls this asset in later updates.
    await fs.copyFile(join(builtin, asset), join(external, asset))
    await sync()
    await write(builtin, asset, 'v4')
    await sync()
    expect(await read(asset)).toBe('v4')
})

it('reseeds missing files, preserves custom files, and does not delete assets removed upstream', async () => {
    await sync()
    await write(external, 'templates/exported.yaml', 'exported')
    await fs.unlink(join(external, asset))
    expect((await sync()).added).toContain(asset)
    await fs.unlink(join(builtin, asset))
    await sync()
    expect(await read(asset)).toBe('source: builtin-template\n')
    expect(await read('templates/exported.yaml')).toBe('exported')
})

it('merges descriptors and details by ID while retaining user entries, ordering and customized metadata', async () => {
    await sync()
    await write(
        external,
        'templates.json',
        JSON.stringify({
            ...catalog('Original'),
            custom: true,
            templates: {
                'en-US': {
                    categories: ['custom'],
                    recommendedApps: [
                        { id: 'exported', name: 'User' },
                        { name: 'Original', id: 'template-1' }
                    ]
                }
            },
            details: { 'template-1': { description: 'Original' }, exported: { description: 'User' } }
        })
    )
    await write(builtin, 'templates.json', JSON.stringify(catalog('Updated', true)))
    await sync()
    expect(JSON.parse(await read('templates.json'))).toEqual({
        custom: true,
        templates: {
            'en-US': {
                categories: ['custom'],
                recommendedApps: [
                    { id: 'exported', name: 'User' },
                    { id: 'template-1', name: 'Updated' },
                    { id: 'template-2', name: 'New' }
                ]
            }
        },
        details: { 'template-1': { description: 'Updated' }, exported: { description: 'User' } }
    })
})

it('preserves modified descriptors and intentional removals, including on first legacy adoption', async () => {
    await write(
        external,
        'templates.json',
        JSON.stringify({
            templates: {
                'en-US': {
                    categories: ['custom'],
                    recommendedApps: []
                }
            },
            details: {}
        })
    )
    await sync()
    await write(builtin, 'templates.json', JSON.stringify(catalog('Updated', true)))
    await sync()
    expect(JSON.parse(await read('templates.json')).templates['en-US'].recommendedApps).toEqual([
        { id: 'template-2', name: 'New' }
    ])
    await write(external, 'templates.json', JSON.stringify(catalog('Customized')))
    await sync()
    expect(JSON.parse(await read('templates.json')).templates['en-US'].recommendedApps).toEqual([
        { id: 'template-1', name: 'Customized' }
    ])
})

it('tracks distribution catalog extensions so their subsequent updates are synchronized', async () => {
    await write(
        builtin,
        'catalog-extensions.json',
        JSON.stringify([{ migration: 'pro-v1', ids: ['pro-template'], source: 'pro-catalog.json' }])
    )
    const pro = (name: string) => ({ templates: { 'en-US': { recommendedApps: [{ id: 'pro-template', name }] } } })
    await write(builtin, 'pro-catalog.json', JSON.stringify(pro('First')))
    await sync()
    await write(builtin, 'pro-catalog.json', JSON.stringify(pro('Second')))
    await sync()
    expect(JSON.parse(await read('templates.json')).templates['en-US'].recommendedApps).toContainEqual({
        id: 'pro-template',
        name: 'Second'
    })
})

it('serializes independent initializers sharing the same persistent directory', async () => {
    await sync()
    await write(builtin, asset, 'concurrent upgrade')
    const results = await Promise.all([sync(), sync(), sync()])
    expect(results.filter((result) => result.updated.includes(asset))).toHaveLength(1)
    expect(await read(asset)).toBe('concurrent upgrade')
    expect((await fs.readdir(external)).some((file) => file.endsWith('.lock'))).toBe(false)
})

it.each(['before', 'after'])('recovers an interrupted atomic asset publication (%s rename)', async (phase) => {
    await sync()
    await write(builtin, asset, 'version 2')
    const rename = fs.rename.bind(fs)
    const spy = jest.spyOn(fs, 'rename').mockImplementation(async (source, target) => {
        if (target === join(external, asset)) {
            if (phase === 'after') await rename(source, target)
            throw new Error('simulated interruption')
        }
        return rename(source, target)
    })
    await expect(sync()).rejects.toThrow('simulated interruption')
    spy.mockRestore()
    expect(await read(asset)).toBe(phase === 'after' ? 'version 2' : 'source: builtin-template\n')
    expect((await fs.readdir(join(external, 'templates'))).some((file) => file.endsWith('.tmp'))).toBe(false)
    // Recovery also works when the next process runs a newer image than the interrupted one.
    await write(builtin, asset, 'version 3')
    await sync()
    expect(await read(asset)).toBe('version 3')
})

it.each(['before', 'after'])(
    'recovers an interrupted catalog publication including new entries (%s rename)',
    async (phase) => {
        await sync()
        await write(builtin, 'templates.json', JSON.stringify(catalog('Version 2', true)))
        const rename = fs.rename.bind(fs)
        const spy = jest.spyOn(fs, 'rename').mockImplementation(async (source, target) => {
            if (target === join(external, 'templates.json')) {
                if (phase === 'after') await rename(source, target)
                throw new Error('simulated interruption')
            }
            return rename(source, target)
        })
        await expect(sync()).rejects.toThrow('simulated interruption')
        spy.mockRestore()
        await write(builtin, 'templates.json', JSON.stringify(catalog('Version 3', true)))
        await sync()
        expect(JSON.parse(await read('templates.json'))).toEqual(catalog('Version 3', true))
    }
)

it('refuses a damaged or unknown-version manifest before changing any template content', async () => {
    await sync()
    await write(builtin, asset, 'new')
    for (const invalid of ['{', '{"version":2,"files":{},"catalog":{}}']) {
        await write(external, syncManifestName, invalid)
        await expect(sync()).rejects.toThrow()
        expect(await read(asset)).toBe('source: builtin-template\n')
    }
})

it.each(['asset', 'directory', 'manifest'])(
    'rejects a symbolic link at an external %s without writing its destination',
    async (kind) => {
        await sync()
        const outside = createTempDir()
        const target = join(outside, 'target')
        await fs.writeFile(target, 'outside')
        const link = join(external, kind === 'asset' ? asset : kind === 'directory' ? 'templates' : syncManifestName)
        await fs.rm(link, { recursive: true })
        await fs.symlink(kind === 'directory' ? outside : target, link)
        await expect(sync()).rejects.toThrow()
        expect(await fs.readFile(target, 'utf8')).toBe('outside')
    }
)

it('preserves a manual edit made after the pending hash was recorded', async () => {
    await sync()
    await write(builtin, asset, 'new official')
    const rename = fs.rename.bind(fs)
    const spy = jest.spyOn(fs, 'rename').mockImplementation(async (source, target) => {
        await rename(source, target)
        if (target === join(external, syncManifestName)) {
            const state = await readSyncManifest(external)
            if (state?.files[asset].pending) await write(external, asset, 'concurrent local edit')
        }
    })
    await expect(sync()).rejects.toThrow()
    spy.mockRestore()
    expect(await read(asset)).toBe('concurrent local edit')
    expect((await sync()).conflicted).toContain(asset)
})
