jest.mock('../agent-plugin.entity', () => ({ AgentPluginPackage: class {}, AgentResourceBinding: class {} }))
import { AgentPluginUpdateService } from './agent-plugin-update.service'
import { AgentPluginService } from '../agent-plugin.service'
import { AgentPluginUpdateStore } from './agent-plugin-update.store'
import { stagePortableGit } from '../agent-plugin-source'
import { parseAgentPlugin } from '../agent-plugin-parser'
import { DEFAULT_AGENT_PLUGINS_SOURCE, type AgentPluginUpdateProgress } from '@xpert-ai/contracts'
import { rm } from 'node:fs/promises'

const mockScope = { tenantId: 'tenant', organizationId: 'organization' }
jest.mock('../agent-plugin.service', () => ({ AgentPluginService: class {}, requireResourceAdmin: () => mockScope }))
jest.mock('./agent-plugin-update.store', () => ({ AgentPluginUpdateStore: class {} }))
jest.mock('../agent-plugin-source', () => ({ stagePortableGit: jest.fn() }))
jest.mock('../agent-plugin-parser', () => ({ parseAgentPlugin: jest.fn() }))
jest.mock('node:fs/promises', () => ({ rm: jest.fn() }))
const packageId = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee'
const operationId = 'bbbbbbbb-bbbb-4ccc-8ddd-eeeeeeeeeeee'
const commit = 'a'.repeat(40)
const settle = async () => {
    for (let i = 0; i < 35; i++) await Promise.resolve()
}

describe('Agent plugin background updates', () => {
    let receipt: AgentPluginUpdateProgress
    let service: AgentPluginUpdateService
    let held: boolean
    const findOneBy = jest.fn()
    const importStagedDirectory = jest.fn()
    const save = jest.fn()
    const pkg = {
        id: packageId,
        descriptor: { name: 'documents' },
        source: {
            kind: 'git',
            url: DEFAULT_AGENT_PLUGINS_SOURCE.url,
            subdirectory: 'agent-plugins/documents',
            ref: 'b'.repeat(40)
        }
    }
    beforeEach(() => {
        jest.clearAllMocks()
        held = false
        receipt = { operationId: null, packageId: null, branch: null, commit: null, phase: 'idle' }
        findOneBy.mockResolvedValue(structuredClone(pkg))
        importStagedDirectory.mockResolvedValue({ id: packageId, importStatus: 'repaired' })
        jest.mocked(stagePortableGit).mockResolvedValue({ temp: '/staged', root: '/staged/plugin', commit })
        jest.mocked(parseAgentPlugin).mockResolvedValue({ name: 'documents', diagnostics: [], skills: [], servers: [] })
        jest.mocked(rm).mockResolvedValue(undefined)
        save.mockImplementation(async (_scope, value) => {
            receipt = structuredClone(value)
        })
        service = new AgentPluginUpdateService(
            { packages: { findOneBy }, importStagedDirectory } as unknown as AgentPluginService,
            {
                read: async () => structuredClone(receipt),
                save,
                control: async (_scope, work: () => Promise<unknown>) => work(),
                acquire: async () => {
                    if (held) return null
                    held = true
                    return {
                        manager: undefined,
                        release: async () => {
                            held = false
                        }
                    }
                }
            } as unknown as AgentPluginUpdateStore
        )
    })
    it('returns before Git finishes, follows the official branch, and repairs with activation without rewriting references', async () => {
        let finish: (value: Awaited<ReturnType<typeof stagePortableGit>>) => void
        jest.mocked(stagePortableGit).mockImplementation(
            () =>
                new Promise((resolve) => {
                    finish = resolve
                })
        )
        const accepted = await service.start(packageId, {})
        expect(accepted.phase).toBe('updating')
        await settle()
        expect(importStagedDirectory).not.toHaveBeenCalled()
        expect(stagePortableGit).toHaveBeenCalledWith(pkg.source.url, 'refs/heads/main', pkg.source.subdirectory)
        expect(findOneBy).toHaveBeenCalledWith({ ...mockScope, id: packageId })
        finish({ temp: '/staged', root: '/staged/plugin', commit })
        await settle()
        expect(importStagedDirectory).toHaveBeenCalledWith(
            '/staged/plugin',
            { ...pkg.source, ref: 'main', commit },
            true,
            undefined
        )
        expect(receipt).toMatchObject({ phase: 'completed', result: { packageId, status: 'repaired' } })
        await service.start(packageId, { operationId: accepted.operationId })
        expect(stagePortableGit).toHaveBeenCalledTimes(1)
    })
    it('resumes a pinned commit after a worker restart and rejects changed resume sources', async () => {
        receipt = { operationId, packageId, branch: 'release', commit, phase: 'updating' }
        await expect(service.start(packageId, { operationId: 'other' })).rejects.toThrow()
        await expect(service.start(packageId, { branch: 'other' })).rejects.toThrow()
        await service.start(packageId, { operationId })
        await settle()
        expect(stagePortableGit).toHaveBeenCalledWith(pkg.source.url, commit, pkg.source.subdirectory)
        expect(receipt.phase).toBe('completed')
    })
    it('returns a completed receipt even after its unused source version was cleaned', async () => {
        receipt = {
            operationId,
            packageId,
            branch: 'main',
            commit,
            phase: 'completed',
            result: { packageId: 'new', status: 'imported' }
        }
        findOneBy.mockResolvedValue(null)
        expect(await service.start(packageId, { operationId })).toEqual(receipt)
        expect(stagePortableGit).not.toHaveBeenCalled()
    })
    it('never starts a second worker while the receipt is active', async () => {
        held = true
        receipt = { operationId, packageId, branch: 'main', commit: null, phase: 'updating' }
        await Promise.all([service.start(packageId, {}), service.start(packageId, { operationId })])
        await settle()
        expect(stagePortableGit).not.toHaveBeenCalled()
    })
    it('rejects ZIPs, unknown packages and untracked commit pins before starting work', async () => {
        findOneBy.mockResolvedValueOnce(null)
        await expect(service.start(packageId, {})).rejects.toThrow()
        findOneBy.mockResolvedValueOnce({ ...pkg, source: { kind: 'zip' } })
        await expect(service.start(packageId, {})).rejects.toThrow()
        findOneBy.mockResolvedValueOnce({ ...pkg, source: { ...pkg.source, url: 'https://example.test/plugins.git' } })
        await expect(service.start(packageId, {})).rejects.toThrow()
        expect(save).not.toHaveBeenCalled()
    })
    it('rejects a changed manifest identity and records fetch failures', async () => {
        jest.mocked(parseAgentPlugin).mockResolvedValue({
            name: 'another-plugin',
            diagnostics: [],
            skills: [],
            servers: []
        })
        await service.start(packageId, {})
        await settle()
        expect(receipt.phase).toBe('failed')
        expect(importStagedDirectory).not.toHaveBeenCalled()
        expect(rm).toHaveBeenCalledWith('/staged', { recursive: true, force: true })
        jest.mocked(stagePortableGit).mockRejectedValue(new Error('offline'))
        await service.start(packageId, {})
        await settle()
        expect(receipt).toMatchObject({ phase: 'failed', error: 'offline' })
    })
})
