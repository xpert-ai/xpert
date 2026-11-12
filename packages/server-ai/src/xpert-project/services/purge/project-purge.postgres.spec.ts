import { DeleteFileAssetHandler } from '../../../file-understanding/commands/handlers/delete-file-asset.handler'
import { randomUUID } from 'node:crypto'
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { DataSource, EntitySchema } from 'typeorm'
import { RequestContext } from '@xpert-ai/plugin-sdk'
import { XpertProject } from '../../entities/project.entity'
import { FileAsset } from '../../../file-understanding/entities/file-asset.entity'
import { XpertProjectAccessService } from '../project-access.service'
import { XpertProjectPurgeService } from '../project-purge.service'
import { VolumeHandle } from '../../../shared/volume'
import { withProjectProvisioning } from './project-purge-receipt'

const url = process.env.XPERT_PURGE_TEST_DATABASE_URL
const schema = 'purge_' + randomUUID().replace(/-/g, '')
const tenantId = randomUUID(),
    organizationId = randomUUID(),
    ownerId = randomUUID(),
    xpertId = randomUUID()
const migration = '20261110000300-project-purge-receipts.sql'

;(url ? describe : describe.skip)('permanent Project deletion on PostgreSQL', () => {
    let db: DataSource
    let root: string
    let projectId: string
    let service: XpertProjectPurgeService
    const authorize = jest.fn()
    const deleteBindings = jest.fn()
    const purgeFile = jest.fn()
    const input = () => ({ projectId, xpertId })
    const state = async () =>
        (await db.query('SELECT "completedAt" FROM xpert_project_purge WHERE "projectId"=$1', [projectId]))[0]
    const projects = () => db.getRepository(XpertProject)
    const assets = () => db.getRepository(FileAsset)
    const workspace = () => path.join(root, projectId)

    beforeAll(async () => {
        if (new URL(url).pathname !== '/xpert_project_purge_test') throw Error('Dedicated purge test database required')
        const assistant = new EntitySchema({ name: 'PurgeAssistant', columns: { id: { type: 'uuid', primary: true } } })
        const project = new EntitySchema<XpertProject>({
            name: 'XpertProject',
            target: XpertProject,
            tableName: 'xpert_project',
            columns: {
                id: { type: 'uuid', primary: true },
                tenantId: { type: 'uuid' },
                ownerId: { type: 'uuid' },
                organizationId: { type: 'uuid', nullable: true },
                status: { type: String }
            },
            relations: { xperts: { type: 'many-to-many', target: 'PurgeAssistant', joinTable: true } }
        })
        const file = new EntitySchema<FileAsset>({
            name: 'FileAsset',
            target: FileAsset,
            tableName: 'file_asset',
            columns: {
                id: { type: 'uuid', primary: true },
                tenantId: { type: 'uuid' },
                projectId: { type: 'uuid' },
                status: { type: String }
            }
        })
        db = await new DataSource({
            type: 'postgres',
            url,
            schema,
            extra: { options: '-c search_path=' + schema + ',public' },
            entities: [project, file, assistant]
        }).initialize()
        await db.query('CREATE SCHEMA "' + schema + '"')
        await db.synchronize()
        const sql = await readFile(path.join(__dirname, '../../migrations', migration), 'utf8')
        await db.query(sql)
        await db.query(sql)
        expect(
            await db.query(await readFile(path.join(__dirname, '../../migrations/checks', migration), 'utf8'))
        ).toEqual([])
        root = await mkdtemp(path.join(tmpdir(), 'xpert-purge-'))
        await db.getRepository('PurgeAssistant').insert({ id: xpertId })
    })
    afterAll(async () => {
        if (root) await rm(root, { recursive: true, force: true })
        if (db?.isInitialized) {
            try {
                await db.query('DROP SCHEMA "' + schema + '" CASCADE')
            } finally {
                await db.destroy()
            }
        }
    })
    beforeEach(async () => {
        jest.resetAllMocks()
        projectId = randomUUID()
        jest.spyOn(RequestContext, 'currentUser').mockReturnValue({ id: ownerId, tenantId })
        jest.spyOn(RequestContext, 'currentTenantId').mockReturnValue(tenantId)
        jest.spyOn(RequestContext, 'getOrganizationId').mockReturnValue(organizationId)
        jest.spyOn(RequestContext, 'currentUserId').mockReturnValue(ownerId)
        await projects().insert({ id: projectId, tenantId, ownerId, organizationId, status: 'archived' })
        await db.createQueryBuilder().relation(XpertProject, 'xperts').of(projectId).add(xpertId)
        await assets().insert({ id: randomUUID(), projectId, tenantId, status: 'ready' })
        await mkdir(workspace())
        await writeFile(path.join(workspace(), 'bid.txt'), 'sample')
        const access = new XpertProjectAccessService(
            projects(),
            {} as never,
            {} as never,
            { isPrincipal: async () => false } as never
        )
        purgeFile.mockImplementation(async (id: string, projectId: string) =>
            assets().delete({ id, projectId, tenantId })
        )
        const volumes = {
            resolve: () => ({ serverRoot: workspace(), withRemovalBudget: (f: () => Promise<void>) => f() }),
            resolveRoot: () => ({ serverRoot: root })
        }
        service = new XpertProjectPurgeService(
            access,
            { assertProvisionedPurge: authorize } as never,
            { deleteProjectBindings: deleteBindings } as never,
            new DeleteFileAssetHandler({ purgeProjectFile: purgeFile } as never) as never,
            assets(),
            volumes as never
        )
        jest.spyOn(VolumeHandle, 'removePath').mockImplementation((base, relative) =>
            rm(path.join(base, relative), { recursive: true, force: true })
        )
    })
    afterEach(() => jest.restoreAllMocks())

    it('keeps a durable fence after an external failure and resumes without asking the provider again', async () => {
        jest.mocked(VolumeHandle.removePath).mockRejectedValueOnce(new Error('disk offline'))
        await expect(service.purge(input())).rejects.toThrow('disk offline')
        expect(await state()).toMatchObject({ completedAt: null })
        expect(await assets().countBy({ projectId })).toBe(0)
        await expect(stat(workspace())).resolves.toBeDefined()
        await expect(service.assertRestorable(input())).rejects.toMatchObject({ status: 409 })
        await expect(projects().update(projectId, { status: 'active' })).rejects.toMatchObject({ code: '23514' })
        await expect(projects().delete(projectId)).rejects.toMatchObject({ code: '23514' })
        const ensure = jest.fn()
        await expect(withProjectProvisioning(db.manager, input(), ensure)).rejects.toMatchObject({ status: 409 })
        expect(ensure).not.toHaveBeenCalled()
        authorize.mockRejectedValue(new Error('provider offline'))
        await expect(service.purge(input())).resolves.toMatchObject({ deleted: true })
        expect(authorize).toHaveBeenCalledTimes(1)
        expect(purgeFile).toHaveBeenCalledTimes(1)
        expect((await state()).completedAt).toBeInstanceOf(Date)
        await expect(stat(workspace())).rejects.toMatchObject({ code: 'ENOENT' })
    })

    it('commits completion with the physical delete and only acknowledges an exact scoped replay', async () => {
        deleteBindings.mockRejectedValueOnce(new Error('connector unavailable'))
        await expect(service.purge(input())).rejects.toThrow('connector unavailable')
        expect((await state()).completedAt).toBeNull()
        expect(await projects().existsBy({ id: projectId })).toBe(true)
        await service.purge(input())
        expect(await projects().existsBy({ id: projectId })).toBe(false)
        const calls = jest.mocked(VolumeHandle.removePath).mock.calls.length
        await expect(service.purge(input())).resolves.toEqual({ projectId, deleted: true })
        expect(VolumeHandle.removePath).toHaveBeenCalledTimes(calls)
        await expect(
            projects().insert({ id: projectId, status: 'active', tenantId, ownerId, organizationId })
        ).rejects.toMatchObject({ code: '23514' })
        await expect(service.purge({ projectId: randomUUID(), xpertId })).rejects.toMatchObject({ status: 403 })
        await expect(service.purge({ projectId, xpertId: randomUUID() })).rejects.toMatchObject({ status: 403 })
        jest.mocked(RequestContext.getOrganizationId).mockReturnValueOnce(null)
        await expect(service.purge(input())).rejects.toMatchObject({ status: 403 })
        jest.mocked(RequestContext.currentUser).mockReturnValueOnce({ id: ownerId, tenantId: randomUUID() })
        await expect(service.purge(input())).rejects.toMatchObject({ status: 403 })
        jest.mocked(RequestContext.currentUser).mockReturnValueOnce({ id: randomUUID(), tenantId })
        await expect(service.purge(input())).rejects.toMatchObject({ status: 403 })
    })

    it('serializes concurrent cleanup and rejects restore while external deletion is running', async () => {
        let release!: () => void, started!: () => void
        const paused = new Promise<void>((resolve) => {
            release = resolve
        })
        const active = new Promise<void>((resolve) => {
            started = resolve
        })
        purgeFile.mockImplementationOnce(async (id: string) => {
            started()
            await paused
            await assets().delete(id)
        })
        const running = service.purge(input())
        try {
            await Promise.race([
                active,
                running.then(() => {
                    throw Error('cleanup did not pause')
                })
            ])
            await expect(service.purge(input())).rejects.toMatchObject({ status: 409 })
            await expect(service.assertRestorable(input())).rejects.toMatchObject({ status: 409 })
            await expect(projects().update(projectId, { status: 'active' })).rejects.toMatchObject({ code: '23514' })
        } finally {
            release()
            await running
        }
        expect(purgeFile).toHaveBeenCalledTimes(1)
        expect(VolumeHandle.removePath).toHaveBeenCalledTimes(1)
    })

    it('fences a stale database writer already waiting on the admission row lock', async () => {
        let unlock!: () => void
        let locked!: () => void
        const hold = new Promise<void>((resolve) => {
            unlock = resolve
        })
        const admission = new Promise<void>((resolve) => {
            locked = resolve
        })
        authorize.mockImplementationOnce(async () => {
            locked()
            await hold
        })
        const running = service.purge(input())
        const writer = db.createQueryRunner()
        await writer.connect()
        try {
            await Promise.race([
                admission,
                running.then(() => {
                    throw Error('admission did not pause')
                })
            ])
            const [{ pid }] = await writer.query('SELECT pg_backend_pid() AS pid')
            const restore = Promise.allSettled([
                writer.query("UPDATE xpert_project SET status='active' WHERE id=$1", [projectId])
            ])
            const deadline = Date.now() + 5000
            while (true) {
                const [activity] = await db.query('SELECT wait_event_type FROM pg_stat_activity WHERE pid=$1', [pid])
                if (activity?.wait_event_type === 'Lock') break
                if (Date.now() >= deadline) throw Error('restore did not wait for admission')
                await new Promise((resolve) => setTimeout(resolve, 10))
            }
            unlock()
            expect(await restore).toMatchObject([{ status: 'rejected', reason: { code: '23514' } }])
        } finally {
            unlock()
            await writer.release()
            await running
        }
        expect((await state()).completedAt).toBeInstanceOf(Date)
    })

    it('does not start cleanup if restore wins admission or business authorization fails', async () => {
        await withProjectProvisioning(db.manager, input(), async () => {
            await expect(service.purge(input())).rejects.toMatchObject({ status: 409 })
            await projects().update(projectId, { status: 'active' })
        })
        await expect(service.purge(input())).rejects.toMatchObject({ status: 403 })
        await projects().update(projectId, { status: 'archived' })
        authorize.mockRejectedValueOnce(new Error('binding mismatch'))
        await expect(service.purge(input())).rejects.toThrow('binding mismatch')
        expect(await state()).toBeUndefined()
        expect(await assets().countBy({ projectId })).toBe(1)
        expect(VolumeHandle.removePath).not.toHaveBeenCalled()
        await service.assertRestorable(input())
    })
})
