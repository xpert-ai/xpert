import { mkdtemp, mkdir, rm, writeFile, symlink, realpath } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { DEFAULT_AGENT_PLUGINS_SOURCE, type DefaultAgentPluginsImportProgress } from '@xpert-ai/contracts'
import { AgentPluginService } from '../agent-plugin.service'
import { stagePortableGit } from '../agent-plugin-source'
import { defaultAgentPluginsManifest } from './default-agent-plugins.schema'
import { DefaultAgentPluginsImporter } from './default-agent-plugins.importer'

jest.mock('../agent-plugin.service', () => ({ AgentPluginService: class {} }))
jest.mock('../agent-plugin-source', () => ({ stagePortableGit: jest.fn() }))

describe('official Agent plugin imports', () => {
    let temp: string
    let root: string
    let handler: DefaultAgentPluginsImporter
    const scope = { tenantId: 'tenant', organizationId: 'org' }
    let progress: DefaultAgentPluginsImportProgress
    const persist = jest.fn(async () => {})
    const execute = async () => {
        await handler.run(scope, progress, persist)
        return progress
    }
    const plugins = { packages: { find: jest.fn() }, importStagedDirectory: jest.fn() }
    const stage = jest.mocked(stagePortableGit)
    const manifest = (plugins: Array<{ id: string; path?: string }>) =>
        writeFile(join(root, 'quickstart.json'), JSON.stringify({ version: 1, plugins }))

    beforeEach(async () => {
        jest.resetAllMocks()
        temp = await mkdtemp(join(tmpdir(), 'default-agent-test-'))
        root = join(temp, 'agent-plugins')
        await mkdir(root)
        await mkdir(join(root, 'documents'))
        await mkdir(join(root, 'pdf'))
        await mkdir(join(root, 'notion'))
        await manifest([{ id: 'documents' }, { id: 'pdf' }, { id: 'notion' }])
        stage.mockResolvedValue({ temp, root, commit: 'fixed-commit' })
        progress = {
            operationId: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee',
            phase: 'fetching',
            commit: null,
            total: 0,
            currentId: null,
            items: [],
            updatedAt: new Date().toISOString()
        }
        plugins.packages.find.mockResolvedValue([])
        plugins.importStagedDirectory.mockImplementation(async (path: string) => {
            const id = path.split('/').pop()
            return { id, digest: id, descriptor: { name: id, diagnostics: [] } }
        })
        handler = new DefaultAgentPluginsImporter(plugins as unknown as AgentPluginService)
    })
    afterEach(async () => {
        await rm(temp, { recursive: true, force: true })
    })

    it('stages one fixed source, imports in order, reports existing versions, and isolates failures', async () => {
        plugins.packages.find.mockResolvedValue([{ digest: 'documents' }])
        plugins.importStagedDirectory.mockImplementation(async (path: string) => {
            const id = path.split('/').pop()
            if (id === 'pdf') throw new Error('Invalid package')
            return { id, digest: id, descriptor: { name: id, diagnostics: id === 'notion' ? [{}] : [] } }
        })
        const result = await execute()
        expect(stage).toHaveBeenCalledTimes(1)
        expect(stage).toHaveBeenCalledWith(DEFAULT_AGENT_PLUGINS_SOURCE.url, 'main', 'agent-plugins')
        expect(result.commit).toBe('fixed-commit')
        expect(result.items.map(({ status }) => status)).toEqual(['existing', 'failed', 'imported'])
        expect(result.items[1].error).toBe('Invalid package')
        expect(result.items[2].diagnosticCount).toBe(1)
        expect(plugins.importStagedDirectory.mock.calls[2][1]).toEqual({
            kind: 'git',
            url: DEFAULT_AGENT_PLUGINS_SOURCE.url,
            ref: 'fixed-commit',
            commit: 'fixed-commit',
            subdirectory: 'agent-plugins/notion'
        })
        expect(plugins.packages.find).toHaveBeenCalledWith({ where: { tenantId: 'tenant', organizationId: 'org' } })
        expect(result.phase).toBe('completed')
        expect(result.total).toBe(3)
        expect(persist).toHaveBeenCalled()
    })

    it('imports explicit nested paths and records the correct Git subdirectory', async () => {
        await mkdir(join(root, 'assistants/office-ops'), { recursive: true })
        const directory = await realpath(join(root, 'assistants/office-ops'))
        await manifest([{ id: 'office-ops', path: 'assistants/office-ops' }])
        const result = await execute()
        expect(result.items[0].id).toBe('office-ops')
        expect(plugins.importStagedDirectory).toHaveBeenCalledWith(
            directory,
            expect.objectContaining({ subdirectory: 'agent-plugins/assistants/office-ops' })
        )
    })

    it('accepts the full 110-package catalog and rejects path traversal or duplicate destinations', () => {
        const plugins = Array.from({ length: 110 }, (_, index) => ({ id: `package-${index}` }))
        expect(defaultAgentPluginsManifest.parse({ version: 1, plugins }).plugins).toHaveLength(110)
        for (const path of [
            '../escape',
            '/absolute',
            'assistants/../escape',
            'assistants//office-ops',
            'assistants\\office-ops'
        ]) {
            expect(
                defaultAgentPluginsManifest.safeParse({ version: 1, plugins: [{ id: 'office-ops', path }] }).success
            ).toBe(false)
        }
        expect(
            defaultAgentPluginsManifest.safeParse({
                version: 1,
                plugins: [
                    { id: 'one', path: 'assistants/one' },
                    { id: 'two', path: 'assistants/one' }
                ]
            }).success
        ).toBe(false)
    })

    it.each([{ ids: [{ id: '../escape' }] }, { ids: [{ id: 'documents' }, { id: 'documents' }] }])(
        'rejects an unsafe or duplicate manifest',
        async ({ ids }) => {
            await manifest(ids)
            await expect(execute()).rejects.toThrow()
            expect(plugins.importStagedDirectory).not.toHaveBeenCalled()
        }
    )

    it('rejects a package symlink escaping the staged directory and continues', async () => {
        await symlink(temp, join(root, 'escape'))
        await manifest([{ id: 'escape' }, { id: 'documents' }])
        const result = await execute()
        expect(result.items.map(({ status }) => status)).toEqual(['failed', 'imported'])
        expect(plugins.importStagedDirectory).toHaveBeenCalledTimes(1)
    })

    it('reports repository failures before importing any packages', async () => {
        stage.mockRejectedValue(new Error('network'))
        await expect(execute()).rejects.toThrow()
        expect(plugins.importStagedDirectory).not.toHaveBeenCalled()
    })
    it('resumes the pinned commit and skips every recorded outcome', async () => {
        progress.commit = 'fixed-commit'
        progress.items = [
            { id: 'documents', status: 'imported' },
            { id: 'pdf', status: 'failed', error: 'Invalid package' }
        ]
        const saved: number[] = []
        persist.mockImplementation(async () => {
            saved.push(progress.items.length)
        })
        await execute()
        expect(stage).toHaveBeenCalledWith(DEFAULT_AGENT_PLUGINS_SOURCE.url, 'fixed-commit', 'agent-plugins')
        expect(plugins.importStagedDirectory).toHaveBeenCalledTimes(1)
        expect(progress.items.map((item) => item.id)).toEqual(['documents', 'pdf', 'notion'])
        expect(saved.at(-1)).toBe(3)
    })

    it('persists incremental progress for the full 110-package catalog', async () => {
        const catalog = Array.from({ length: 110 }, (_, index) => ({ id: `package-${index}` }))
        for (const item of catalog) await mkdir(join(root, item.id))
        await manifest(catalog)
        const saved: number[] = []
        persist.mockImplementation(async () => {
            saved.push(progress.items.length)
        })
        await execute()
        expect(progress.items).toHaveLength(110)
        expect(progress.phase).toBe('completed')
        expect(new Set(saved).size).toBe(111)
        expect(stage).toHaveBeenCalledTimes(1)
    })
})
