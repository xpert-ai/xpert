import { ForbiddenException } from '@nestjs/common'
import type { DefaultAgentPluginsImportProgress } from '@xpert-ai/contracts'
import { requireResourceAdmin } from '../agent-plugin.service'
import { DefaultAgentPluginsService } from './default-agent-plugins.service'
import { DefaultAgentPluginsStore } from './default-agent-plugins.store'
import { DefaultAgentPluginsImporter } from './default-agent-plugins.importer'

jest.mock('../agent-plugin.service', () => ({ requireResourceAdmin: jest.fn() }))
jest.mock('./default-agent-plugins.store', () => ({ DefaultAgentPluginsStore: class {} }))
jest.mock('./default-agent-plugins.importer', () => ({ DefaultAgentPluginsImporter: class {} }))

describe('background default Agent plugin imports', () => {
    const scope = { tenantId: 'tenant', organizationId: 'org' }
    let progress: DefaultAgentPluginsImportProgress
    let releaseWorker: () => void
    let finished: Promise<void>
    let unlock: jest.Mock
    let service: DefaultAgentPluginsService
    const store = { control: jest.fn(), acquire: jest.fn(), read: jest.fn(), save: jest.fn() }
    const importer = { run: jest.fn() }

    beforeEach(() => {
        jest.clearAllMocks()
        jest.mocked(requireResourceAdmin).mockReturnValue(scope)
        progress = {
            operationId: null,
            phase: 'idle',
            commit: null,
            total: 0,
            currentId: null,
            items: [],
            updatedAt: new Date().toISOString()
        }
        let locked = false
        let finish: () => void
        finished = new Promise<void>((resolve) => {
            finish = resolve
        })
        unlock = jest.fn(async () => {
            locked = false
            finish()
        })
        store.control.mockImplementation(async (_scope, work) => work())
        store.acquire.mockImplementation(async () => {
            if (locked) return null
            locked = true
            return { manager: undefined, release: unlock }
        })
        store.read.mockImplementation(async () => structuredClone(progress))
        store.save.mockImplementation(async (_scope, value) => {
            progress = structuredClone(value)
        })
        const wait = new Promise<void>((resolve) => {
            releaseWorker = resolve
        })
        importer.run.mockImplementation(async (_scope, value, persist) => {
            await wait
            value.commit = 'pinned'
            value.total = 110
            value.phase = 'completed'
            await persist()
        })
        service = new DefaultAgentPluginsService(
            store as unknown as DefaultAgentPluginsStore,
            importer as unknown as DefaultAgentPluginsImporter
        )
    })

    afterEach(() => {
        releaseWorker()
    })

    it('returns a persisted receipt while a slow import remains blocked and joins retries', async () => {
        const receipt = await service.start()
        expect(receipt.phase).toBe('fetching')
        expect(receipt.operationId).toBeTruthy()
        expect(await service.status()).toEqual(receipt)
        const retry = await service.start({ operationId: receipt.operationId })
        expect(retry.operationId).toBe(receipt.operationId)
        expect(importer.run).toHaveBeenCalledTimes(1)
        expect(unlock).not.toHaveBeenCalled()
        releaseWorker()
        await finished
        expect((await service.status()).phase).toBe('completed')
        expect(receipt.phase).toBe('fetching')
    })

    it('recovers a persisted interrupted job with a new service instance', async () => {
        progress = {
            ...progress,
            operationId: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee',
            phase: 'importing',
            commit: 'pinned',
            total: 110,
            items: [{ id: 'documents', status: 'imported' }]
        }
        const receipt = await service.start({ operationId: progress.operationId })
        expect(receipt.items).toHaveLength(1)
        releaseWorker()
        await finished
        expect(importer.run).toHaveBeenCalledWith(
            scope,
            expect.objectContaining({ commit: 'pinned', items: receipt.items }),
            expect.any(Function),
            undefined
        )
        expect((await service.status()).phase).toBe('completed')
    })

    it('does not restart a completed job when a delayed resume arrives', async () => {
        const receipt = await service.start()
        releaseWorker()
        await finished
        const complete = await service.start({ operationId: receipt.operationId })
        expect(complete.phase).toBe('completed')
        expect(importer.run).toHaveBeenCalledTimes(1)
        expect((await service.start()).operationId).not.toBe(receipt.operationId)
    })

    it('lets setup await the final result of an existing background job without duplicating imports', async () => {
        await service.start()
        const result = service.importAndWait()
        releaseWorker()
        expect(await result).toEqual({ commit: 'pinned', items: [] })
        expect(importer.run).toHaveBeenCalledTimes(1)
    })

    it('persists failures and releases the worker lock', async () => {
        importer.run.mockRejectedValueOnce(new Error('Repository unavailable'))
        await service.start()
        await finished
        expect(progress.phase).toBe('failed')
        expect(progress.error).toBe('Repository unavailable')
        expect(unlock).toHaveBeenCalledTimes(1)
    })

    it('explicit retries preserve a failed batch snapshot and completed items', async () => {
        progress = {
            ...progress,
            operationId: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee',
            phase: 'failed',
            commit: 'pinned',
            total: 110,
            items: [{ id: 'documents', status: 'imported' }],
            error: 'Interrupted'
        }
        const retry = await service.start()
        expect(retry.operationId).toBe('aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee')
        expect(retry.commit).toBe('pinned')
        expect(retry.items).toHaveLength(1)
        expect(retry.error).toBeUndefined()
        releaseWorker()
        await finished
    })

    it('rejects foreign or stale resume IDs without scheduling work', async () => {
        await expect(service.start({ operationId: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee' })).rejects.toThrow()
        expect(store.acquire).not.toHaveBeenCalled()
        expect(store.save).not.toHaveBeenCalled()
    })

    it('authorizes both reads and writes before accessing progress or workers', async () => {
        jest.mocked(requireResourceAdmin).mockImplementation(() => {
            throw new ForbiddenException()
        })
        expect(() => service.status()).toThrow(ForbiddenException)
        await expect(service.start()).rejects.toThrow(ForbiddenException)
        expect(store.read).not.toHaveBeenCalled()
        expect(store.acquire).not.toHaveBeenCalled()
    })
})
