import { mkdtemp, mkdir, rm, writeFile, symlink } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { DataSource } from 'typeorm'
import { DEFAULT_AGENT_PLUGINS_SOURCE } from '@xpert-ai/contracts'
import { AgentPluginService, requireResourceAdmin } from '../agent-plugin.service'
import { stagePortableGit } from '../agent-plugin-source'
import { ImportDefaultAgentPluginsHandler } from './import-default-agent-plugins.handler'

jest.mock('../agent-plugin.service', () => ({ AgentPluginService: class {}, requireResourceAdmin: jest.fn() }))
jest.mock('../agent-plugin-source', () => ({ stagePortableGit: jest.fn() }))

describe('official Agent plugin imports', () => {
    let temp: string
    let root: string
    let handler: ImportDefaultAgentPluginsHandler
    const connection = { connect: jest.fn(), query: jest.fn(), release: jest.fn() }
    const plugins = { packages: { find: jest.fn() }, importStagedDirectory: jest.fn() }
    const stage = jest.mocked(stagePortableGit)
    const admin = jest.mocked(requireResourceAdmin)
    const manifest = (plugins: Array<{ id: string }>) =>
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
        admin.mockReturnValue({ tenantId: 'tenant', organizationId: 'org' })
        connection.query.mockResolvedValue([{ acquired: true }])
        plugins.packages.find.mockResolvedValue([])
        plugins.importStagedDirectory.mockImplementation(async (path: string) => {
            const id = path.split('/').pop()
            return { id, digest: id, descriptor: { name: id, diagnostics: [] } }
        })
        handler = new ImportDefaultAgentPluginsHandler(
            plugins as unknown as AgentPluginService,
            { createQueryRunner: () => connection } as unknown as DataSource
        )
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
        const result = await handler.execute()
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
        expect(connection.query).toHaveBeenLastCalledWith('SELECT pg_advisory_unlock(hashtext($1))', [
            'xpert:agent-plugin-defaults:tenant:org'
        ])
        expect(connection.release).toHaveBeenCalled()
    })

    it('requires organization administrator access before touching Git or the database', async () => {
        admin.mockImplementation(() => {
            throw new Error('Forbidden')
        })
        await expect(handler.execute()).rejects.toThrow('Forbidden')
        expect(stage).not.toHaveBeenCalled()
        expect(connection.connect).not.toHaveBeenCalled()
    })

    it('does not start a duplicate import while the organization lock is held', async () => {
        connection.query.mockResolvedValue([{ acquired: false }])
        await expect(handler.execute()).rejects.toThrow()
        expect(stage).not.toHaveBeenCalled()
        expect(connection.query).toHaveBeenCalledTimes(1)
        expect(connection.release).toHaveBeenCalled()
    })

    it.each([{ ids: [{ id: '../escape' }] }, { ids: [{ id: 'documents' }, { id: 'documents' }] }])(
        'rejects an unsafe or duplicate manifest',
        async ({ ids }) => {
            await manifest(ids)
            await expect(handler.execute()).rejects.toThrow()
            expect(plugins.importStagedDirectory).not.toHaveBeenCalled()
            expect(connection.release).toHaveBeenCalled()
        }
    )

    it('rejects a package symlink escaping the staged directory and continues', async () => {
        await symlink(temp, join(root, 'escape'))
        await manifest([{ id: 'escape' }, { id: 'documents' }])
        const result = await handler.execute()
        expect(result.items.map(({ status }) => status)).toEqual(['failed', 'imported'])
        expect(plugins.importStagedDirectory).toHaveBeenCalledTimes(1)
    })

    it('releases its lock when the repository cannot be fetched', async () => {
        stage.mockRejectedValue(new Error('network'))
        await expect(handler.execute()).rejects.toThrow()
        expect(connection.release).toHaveBeenCalled()
        expect(plugins.importStagedDirectory).not.toHaveBeenCalled()
    })
})
