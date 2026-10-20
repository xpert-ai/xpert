jest.mock('../xpert.entity', () => ({ Xpert: class Xpert {} }))
jest.mock('../../xpert-agent/xpert-agent.entity', () => ({ XpertAgent: class XpertAgent {} }))
jest.mock('../../xpert-workspace/workspace-access.service', () => ({
    XpertWorkspaceAccessService: class XpertWorkspaceAccessService {}
}))
jest.mock('../../shared/tag-associations', () => ({ assertValidTagAssociations: jest.fn() }))
jest.mock('@xpert-ai/plugin-sdk', () => ({ RequestContext: { currentUserId: () => null } }))
jest.mock('@xpert-ai/server-core', () => ({
    BusinessArea: class BusinessArea {},
    RequestContext: { getLanguageCode: () => 'en' }
}))
jest.mock('../xpert.service', () => ({ XpertService: class XpertService {} }))
jest.mock('../../prompt-workflow', () => ({ PromptWorkflowService: class PromptWorkflowService {} }))
jest.mock('../xpert-principal.service', () => ({ XpertPrincipalService: class XpertPrincipalService {} }))
jest.mock('../types', () => ({ EventName_XpertPublished: 'xpert.published' }))
import { randomUUID } from 'node:crypto'
import { DataSource, EntitySchema } from 'typeorm'
import { I18nService } from 'nestjs-i18n'
import { CommandBus } from '@nestjs/cqrs'
import { EventEmitter2 } from '@nestjs/event-emitter'
import { Logger } from '@nestjs/common'
import { AiModelTypeEnum, ICopilotModel, TXpertTeamDraft, XpertTypeEnum } from '@xpert-ai/contracts'
import { Xpert } from '../xpert.entity'
import { XpertService } from '../xpert.service'
import { XpertAgent } from '../../xpert-agent/xpert-agent.entity'
import { XpertWorkspaceAccessService } from '../../xpert-workspace/workspace-access.service'
import { XpertPublicationPersistence } from './publication-persistence'
import { XpertPublishHandler } from '../commands/handlers/publish.handler'
import { XpertPublishCommand } from '../commands/publish.command'

// Only point this at a disposable local test database; each run owns an isolated schema.
const databaseUrl = process.env.XPERT_PUBLICATION_TEST_DATABASE_URL
const postgres = databaseUrl ? describe : describe.skip
const schema = `publication_${randomUUID().replace(/-/g, '')}`
class TestToolset {
    id: string
}
class TestModel implements ICopilotModel {
    id: string
    model: string
}

postgres('publication atomicity on PostgreSQL', () => {
    let database: DataSource
    let persistence: XpertPublicationPersistence
    const access = { assertCanAuthor: jest.fn().mockResolvedValue(undefined) }
    beforeAll(async () => {
        jest.spyOn(Logger.prototype, 'verbose').mockImplementation(() => undefined)
        jest.spyOn(Logger.prototype, 'debug').mockImplementation(() => undefined)
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
                        copilotModelId: { type: 'uuid', nullable: true },
                        name: { type: 'varchar', nullable: true },
                        slug: { type: 'varchar', nullable: true },
                        type: { type: 'varchar', nullable: true },
                        latest: { type: 'boolean', nullable: true },
                        publishAt: { type: 'timestamptz', nullable: true },
                        version: { type: 'varchar', nullable: true },
                        draft: { type: 'json', nullable: true },
                        graph: { type: 'json', nullable: true },
                        updatedAt: { type: 'timestamptz', updateDate: true },
                        agentConfig: { type: 'json', nullable: true },
                        options: { type: 'json', nullable: true }
                    },
                    indices: [
                        {
                            columns: ['tenantId', 'organizationId', 'type', 'slug', 'version', 'latest'],
                            unique: true
                        }
                    ],
                    // Match production's eager joins and primary-Agent/model cascades.
                    relations: {
                        toolsets: { type: 'many-to-many', target: 'TestToolset', joinTable: true, eager: true },
                        userGroups: { type: 'many-to-many', target: 'TestToolset', joinTable: true },
                        agent: { type: 'one-to-one', target: 'XpertAgent', inverseSide: 'xpert', cascade: true },
                        agents: { type: 'one-to-many', target: 'XpertAgent', inverseSide: 'team' },
                        copilotModel: { type: 'one-to-one', target: 'TestModel', joinColumn: true, cascade: true }
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
                        organizationId: { type: 'varchar', nullable: true },
                        updatedAt: { type: 'timestamptz', updateDate: true },
                        options: { type: 'json', nullable: true },
                        toolsetIds: { type: 'json', nullable: true },
                        xpertId: { type: 'uuid', nullable: true },
                        teamId: { type: 'uuid', nullable: true },
                        copilotModelId: { type: 'uuid', nullable: true }
                    },
                    relations: {
                        xpert: { type: 'one-to-one', target: 'Xpert', joinColumn: true },
                        team: { type: 'many-to-one', target: 'Xpert', joinColumn: true },
                        copilotModel: { type: 'one-to-one', target: 'TestModel', joinColumn: true, cascade: true }
                    }
                }),
                new EntitySchema<TestModel>({
                    name: 'TestModel',
                    target: TestModel,
                    columns: {
                        id: { type: 'uuid', primary: true, generated: 'uuid' },
                        model: { type: 'varchar' }
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
        jest.restoreAllMocks()
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

    function load(id: string) {
        return database.getRepository(Xpert).findOneOrFail({
            where: { id },
            relations: ['agent', 'agent.copilotModel', 'agents', 'agents.copilotModel', 'copilotModel']
        })
    }

    async function seedPublication(model: string | null) {
        const team = await seed()
        await database.getRepository(Xpert).save({
            id: team.id,
            name: `Publication test ${randomUUID()}`,
            slug: randomUUID(),
            type: XpertTypeEnum.Agent,
            latest: false,
            environmentId: 'kept-environment',
            copilotModel: { model: 'assistant-model', modelType: AiModelTypeEnum.LLM }
        })
        await database.getRepository(XpertAgent).save({
            ...team.agent,
            xpertId: team.id,
            updatedAt: new Date('2026-10-01T00:00:00Z'),
            copilotModel: model ? { model, modelType: AiModelTypeEnum.LLM } : null
        })
        await database.getRepository(XpertAgent).save({
            tenantId: team.tenantId,
            organizationId: team.organizationId,
            teamId: team.id,
            key: 'Agent_Child',
            prompt: 'original child',
            updatedAt: new Date('2026-10-01T00:00:00Z'),
            copilotModel: model ? null : { model: 'child-model', modelType: AiModelTypeEnum.LLM }
        })
        const snapshot = await load(team.id)
        const draft: TXpertTeamDraft = JSON.parse(
            JSON.stringify({
                team: { copilotModel: snapshot.copilotModel },
                nodes: [snapshot.agent, ...snapshot.agents].map((entity) => ({
                    type: 'agent',
                    key: entity.key,
                    entity,
                    position: { x: 0, y: 0 }
                })),
                connections: [
                    { type: 'agent', key: 'main/child', from: snapshot.agent.key, to: snapshot.agents[0].key }
                ]
            })
        )
        const graph = structuredClone({ nodes: draft.nodes, connections: draft.connections })
        for (const node of draft.nodes) {
            if (node.type === 'agent') node.entity.prompt = `published ${node.key}`
        }
        await database.getRepository(Xpert).update(team.id, { draft, graph })
        return load(team.id)
    }

    function publisher() {
        const commandBus = { execute: jest.fn() }
        const eventEmitter = { emitAsync: jest.fn() }
        const translate = jest.fn().mockResolvedValue('AgentOutdated')
        const service = {
            assertCanAuthorById: jest.fn().mockResolvedValue(undefined),
            findOne: load,
            findAll: async ({ where }: { where: { name: string } }) => ({
                items: await database.getRepository(Xpert).findBy({ name: where.name })
            }),
            validate: jest.fn().mockResolvedValue([]),
            validateTagAssociations: jest.fn().mockResolvedValue(undefined)
        }
        return {
            commandBus,
            eventEmitter,
            translate,
            handler: new XpertPublishHandler(
                service as unknown as XpertService,
                { translate } as unknown as I18nService,
                commandBus as unknown as CommandBus,
                eventEmitter as unknown as EventEmitter2,
                undefined,
                undefined,
                undefined,
                persistence
            )
        }
    }

    it.each([null, 'agent-model'])(
        'publishes a new version without invalidating its own Agent snapshot (%s)',
        async (model) => {
            const snapshot = await seedPublication(model)
            const { handler } = publisher()
            await handler.execute(new XpertPublishCommand(snapshot.id, true, undefined, 'updated'))
            const current = await load(snapshot.id)
            const backupRow = await database.getRepository(Xpert).findOneByOrFail({ slug: snapshot.slug, version: '1' })
            const backup = await load(backupRow.id)
            expect(current).toMatchObject({
                version: '2',
                draft: null,
                environmentId: snapshot.environmentId,
                copilotModel: { id: snapshot.copilotModel.id, model: 'assistant-model' }
            })
            expect(current.options.pendingPublication).toBeUndefined()
            expect(backup).toMatchObject({
                version: '1',
                draft: null,
                latest: false,
                environmentId: snapshot.environmentId,
                graph: snapshot.graph,
                copilotModel: { model: 'assistant-model' }
            })
            expect(backup.copilotModel.id).not.toBe(current.copilotModel.id)
            for (const [before, published, historical] of [
                [snapshot.agent, current.agent, backup.agent],
                [snapshot.agents[0], current.agents[0], backup.agents[0]]
            ]) {
                expect(published.id).toBe(before.id)
                expect(published.prompt).toBe(`published ${before.key}`)
                expect(historical.id).not.toBe(before.id)
                expect(historical.prompt).toBe(before.prompt)
                expect(historical.updatedAt).toEqual(before.updatedAt)
                expect(published.copilotModel).toEqual(before.copilotModel)
                if (before.copilotModel) {
                    expect(historical.copilotModel.model).toBe(before.copilotModel.model)
                    expect(historical.copilotModel.id).not.toBe(before.copilotModel.id)
                } else {
                    expect(historical.copilotModel).toBeNull()
                }
                const node = current.graph.nodes.find((node) => node.key === published.key)
                if (node?.type !== 'agent') throw new Error('Published Agent node is missing')
                expect(node.entity.updatedAt).toBe(published.updatedAt.toISOString())
            }
        }
    )

    it.each(['primary', 'child'])(
        'rejects a genuinely stale %s Agent and rolls back the version and backup',
        async (role) => {
            const snapshot = await seedPublication(null)
            const edited = role === 'primary' ? snapshot.agent : snapshot.agents[0]
            await database.getRepository(XpertAgent).update(edited.id, { prompt: 'concurrent edit' })
            const before = await load(snapshot.id)
            const counts = await Promise.all(
                [Xpert, XpertAgent, TestModel].map((entity) => database.getRepository(entity).count())
            )
            const { handler, commandBus, eventEmitter, translate } = publisher()
            await expect(
                handler.execute(new XpertPublishCommand(snapshot.id, true, undefined, 'update'))
            ).rejects.toThrow('AgentOutdated')
            expect(translate).toHaveBeenCalledWith(
                'xpert.Error.AgentOutdated',
                expect.objectContaining({ args: { agentKey: edited.key } })
            )
            expect(await load(snapshot.id)).toEqual(before)
            expect(
                await Promise.all(
                    [Xpert, XpertAgent, TestModel].map((entity) => database.getRepository(entity).count())
                )
            ).toEqual(counts)
            expect(commandBus.execute).not.toHaveBeenCalled()
            expect(eventEmitter.emitAsync).not.toHaveBeenCalled()
        }
    )

    it('still publishes into the current version without creating a backup', async () => {
        const snapshot = await seedPublication(null)
        await publisher().handler.execute(new XpertPublishCommand(snapshot.id, false, undefined, 'update'))
        const current = await load(snapshot.id)
        expect(current).toMatchObject({ version: '1', draft: null })
        expect(current.agent.prompt).toBe('published Agent_Main')
        expect(await database.getRepository(Xpert).countBy({ slug: snapshot.slug })).toBe(1)
    })

    it('rolls back a new-version graph failure and retries with the unchanged Agent timestamps', async () => {
        const snapshot = await seedPublication(null)
        const missingToolset = randomUUID()
        const draft = structuredClone(snapshot.draft)
        draft.nodes.push({
            type: 'toolset',
            key: missingToolset,
            entity: { id: missingToolset, name: 'Tool' },
            position: { x: 0, y: 0 }
        })
        draft.connections.push({ type: 'toolset', key: 'main/tool', from: snapshot.agent.key, to: missingToolset })
        await database.getRepository(Xpert).update(snapshot.id, { draft })
        const before = await load(snapshot.id)
        const counts = await Promise.all(
            [Xpert, XpertAgent, TestModel].map((entity) => database.getRepository(entity).count())
        )
        const { handler, commandBus } = publisher()
        const command = new XpertPublishCommand(snapshot.id, true, undefined, 'update')
        await expect(handler.execute(command)).rejects.toMatchObject({ driverError: { code: '23503' } })
        expect(await load(snapshot.id)).toEqual(before)
        expect(
            await Promise.all([Xpert, XpertAgent, TestModel].map((entity) => database.getRepository(entity).count()))
        ).toEqual(counts)
        expect(commandBus.execute).not.toHaveBeenCalled()
        await database.getRepository(TestToolset).save({ id: missingToolset })
        await handler.execute(command)
        const current = await load(snapshot.id)
        expect(current).toMatchObject({ version: '2', draft: null, toolsets: [{ id: missingToolset }] })
        expect(current.agent.prompt).toBe('published Agent_Main')
        expect(await database.getRepository(Xpert).countBy({ slug: snapshot.slug })).toBe(2)
    })

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

    it.each([true, false])(
        'publishes and backs up current grants after a concurrent sharing change (initial grant: %s)',
        async (initialGrant) => {
            const snapshot = await seed()
            const group = await database.getRepository(TestToolset).save({ id: randomUUID() })
            const relation = () => database.createQueryBuilder().relation(Xpert, 'userGroups').of(snapshot.id)
            if (initialGrant) await relation().add(group.id)
            const before = await database.getRepository(Xpert).findOneOrFail({
                where: { id: snapshot.id },
                relations: ['userGroups']
            })
            const staleInput = { ...snapshot, userGroups: before.userGroups }
            if (initialGrant) await relation().remove(group.id)
            else await relation().add(group.id)

            const backup = await persistence.run(staleInput, async (store) => {
                await store.saveTeam({ ...snapshot, userGroups: before.userGroups, version: '2' })
                return store.createBackup({
                    tenantId: snapshot.tenantId,
                    organizationId: snapshot.organizationId,
                    version: '1',
                    userGroups: before.userGroups
                })
            })
            for (const id of [snapshot.id, backup.id]) {
                const saved = await database
                    .getRepository(Xpert)
                    .findOneOrFail({ where: { id }, relations: ['userGroups'] })
                expect(saved.userGroups.map((item) => item.id)).toEqual(initialGrant ? [] : [group.id])
            }
        }
    )

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
