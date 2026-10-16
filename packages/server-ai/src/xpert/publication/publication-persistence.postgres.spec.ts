jest.mock('../xpert.entity', () => ({ Xpert: class Xpert {} }))
jest.mock('../../xpert-agent/xpert-agent.entity', () => ({ XpertAgent: class XpertAgent {} }))
jest.mock('../../xpert-workspace/workspace-access.service', () => ({
    XpertWorkspaceAccessService: class XpertWorkspaceAccessService {}
}))
jest.mock('../../shared/tag-associations', () => ({ assertValidTagAssociations: jest.fn() }))
jest.mock('@xpert-ai/plugin-sdk', () => ({ RequestContext: { currentUserId: () => null } }))
import { randomUUID } from 'node:crypto'
import { DataSource, EntitySchema } from 'typeorm'
import { Xpert } from '../xpert.entity'
import { XpertAgent } from '../../xpert-agent/xpert-agent.entity'
import { XpertWorkspaceAccessService } from '../../xpert-workspace/workspace-access.service'
import { XpertPublicationPersistence } from './publication-persistence'

// Only point this at a disposable local test database; each run owns an isolated schema.
const databaseUrl = process.env.XPERT_PUBLICATION_TEST_DATABASE_URL
const postgres = databaseUrl ? describe : describe.skip
const schema = `publication_${randomUUID().replace(/-/g, '')}`
class TestToolset {
    id: string
}

postgres('publication atomicity on PostgreSQL', () => {
    let database: DataSource
    let persistence: XpertPublicationPersistence
    const access = { assertCanAuthor: jest.fn().mockResolvedValue(undefined) }
    beforeAll(async () => {
        database = await new DataSource({
            type: 'postgres',
            url: databaseUrl,
            schema,
            entities: [
                new EntitySchema<Xpert>({
                    name: 'Xpert',
                    target: Xpert,
                    columns: {
                        id: { type: 'uuid', primary: true, generated: 'uuid' },
                        tenantId: { type: 'varchar' },
                        organizationId: { type: 'varchar', nullable: true },
                        environmentId: { type: 'varchar', nullable: true },
                        copilotModelId: { type: 'varchar', nullable: true },
                        version: { type: 'varchar', nullable: true },
                        draft: { type: 'json', nullable: true },
                        graph: { type: 'json', nullable: true },
                        updatedAt: { type: 'timestamptz', updateDate: true },
                        agentConfig: { type: 'json', nullable: true },
                        options: { type: 'json', nullable: true }
                    },
                    // Match the eager many-to-many joins on the real Assistant's tags.
                    relations: {
                        toolsets: { type: 'many-to-many', target: 'TestToolset', joinTable: true, eager: true }
                    }
                }),
                new EntitySchema<TestToolset>({
                    name: 'TestToolset',
                    target: TestToolset,
                    columns: { id: { type: 'uuid', primary: true } }
                }),
                new EntitySchema<XpertAgent>({
                    name: 'XpertAgent',
                    target: XpertAgent,
                    columns: {
                        id: { type: 'uuid', primary: true, generated: 'uuid' },
                        key: { type: 'varchar' },
                        prompt: { type: 'varchar', nullable: true },
                        tenantId: { type: 'varchar' },
                        organizationId: { type: 'varchar', nullable: true }
                    }
                })
            ]
        }).initialize()
        await database.query(`CREATE SCHEMA "${schema}"`)
        await database.synchronize()
        persistence = new XpertPublicationPersistence(database, access as unknown as XpertWorkspaceAccessService)
    })
    afterAll(async () => {
        if (database?.isInitialized) {
            await database.query(`DROP SCHEMA "${schema}" CASCADE`)
            await database.destroy()
        }
    })

    async function seed() {
        const team = await database.getRepository(Xpert).save({
            tenantId: 'tenant',
            organizationId: 'org',
            version: '1',
            graph: { nodes: [], connections: [] },
            draft: { team: {}, nodes: [], connections: [] }
        })
        const agent = await database
            .getRepository(XpertAgent)
            .save({ tenantId: 'tenant', organizationId: 'org', key: 'Agent_Main', prompt: 'original' })
        return { ...team, agent, agents: [] } as Xpert
    }

    it('rolls back version, backup and Agent writes when a tool foreign key fails; the original draft remains retryable', async () => {
        const snapshot = await seed()
        const count = await database.getRepository(Xpert).count()
        await expect(
            persistence.run(snapshot, async (store) => {
                await store.saveTeam({ ...snapshot, version: '2' })
                await store.createBackup({
                    tenantId: snapshot.tenantId,
                    organizationId: snapshot.organizationId,
                    version: '1'
                })
                await store.updateAgent(snapshot.agent.id, { prompt: 'new' })
                await store.createAgent({ key: 'Agent_New' })
                // A real FK error raised from the same transaction, reproducing the template placeholder failure.
                await store.saveTeam({
                    ...snapshot,
                    version: '2',
                    toolsets: [{ id: randomUUID(), name: 'missing template binding' }]
                })
            })
        ).rejects.toThrow()
        const saved = await database.getRepository(Xpert).findOneByOrFail({ id: snapshot.id })
        expect(saved.version).toBe('1')
        expect(saved.draft).toEqual(snapshot.draft)
        expect(await database.getRepository(Xpert).count()).toBe(count)
        expect((await database.getRepository(XpertAgent).findOneByOrFail({ id: snapshot.agent.id })).prompt).toBe(
            'original'
        )
        expect(await database.getRepository(XpertAgent).countBy({ key: 'Agent_New' })).toBe(0)
        await persistence.run(snapshot, (store) => store.saveTeam({ ...snapshot, version: '2', draft: null }))
        expect((await database.getRepository(Xpert).findOneByOrFail({ id: snapshot.id })).version).toBe('2')
    })

    it('rejects a stale draft before changing the version', async () => {
        const snapshot = await seed()
        await database
            .getRepository(Xpert)
            .update(snapshot.id, { draft: { team: { title: 'Human edit' }, nodes: [], connections: [] } })
        const write = jest.fn()
        await expect(persistence.run(snapshot, write)).rejects.toThrow()
        expect(write).not.toHaveBeenCalled()
        expect((await database.getRepository(Xpert).findOneByOrFail({ id: snapshot.id })).version).toBe('1')
    })

    it('persists activation recovery with the graph and clears only its checkpoint after success', async () => {
        const snapshot = await seed()
        const published = await persistence.run(snapshot, (store) =>
            store.saveTeam({
                ...snapshot,
                version: '2',
                draft: null,
                options: {
                    pendingPublication: { version: '2', previousGraph: snapshot.graph },
                    modelSelection: { allowedModels: [] }
                }
            })
        )
        const pending = await database.getRepository(Xpert).findOneByOrFail({ id: snapshot.id })
        expect(pending.options.pendingPublication.previousGraph).toEqual(snapshot.graph)
        await persistence.completeActivation(published)
        const active = await database.getRepository(Xpert).findOneByOrFail({ id: snapshot.id })
        expect(active.version).toBe('2')
        expect(active.options.pendingPublication).toBeUndefined()
        expect(active.options.modelSelection).toEqual({ allowedModels: [] })
        await expect(persistence.run(snapshot, jest.fn())).rejects.toThrow()
    })

    it('rejects an Agent outside the authorized Assistant and preserves the write permission check', async () => {
        const snapshot = await seed()
        await expect(
            persistence.run(snapshot, (store) => store.updateAgent(randomUUID(), { prompt: 'wrong' }))
        ).rejects.toThrow()
        access.assertCanAuthor.mockRejectedValueOnce(new Error('forbidden'))
        await expect(persistence.run({ ...snapshot, workspaceId: 'workspace' }, jest.fn())).rejects.toThrow('forbidden')
    })
})
