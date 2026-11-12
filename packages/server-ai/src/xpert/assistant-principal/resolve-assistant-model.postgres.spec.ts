import { ForbiddenException } from '@nestjs/common'
import { CommandBus, CqrsModule } from '@nestjs/cqrs'
import { Test, TestingModule } from '@nestjs/testing'
import { AiModelTypeEnum, KnowledgebaseTypeEnum } from '@xpert-ai/contracts'
import { RequestContext } from '@xpert-ai/plugin-sdk'
import { randomUUID } from 'node:crypto'
import { DataSource, EntitySchema, FindOneOptions, IsNull, Not } from 'typeorm'
import { CopilotModel } from '../../copilot-model/copilot-model.entity'
import { XpertAgent } from '../../xpert-agent/xpert-agent.entity'
import { Xpert } from '../xpert.entity'
import { KnowledgebaseService } from '../../knowledgebase/management/knowledgebase.service'
import { Knowledgebase } from '../../knowledgebase/persistence/knowledgebase.entity'
import { KnowledgebaseGetOneHandler } from '../../knowledgebase/queries/handlers/get-one.handler'
import { AssistantPrincipalAccessService } from './assistant-principal-access.service'
import { ResolveAssistantModelCommand, ResolveAssistantModelHandler } from './resolve-assistant-model.command'

const url = process.env.XPERT_KNOWLEDGE_MODEL_TEST_DATABASE_URL
if (url && !/^\/xpert_knowledge_model_test_[a-z0-9_]+$/.test(new URL(url).pathname))
    throw new Error('A dedicated knowledge model test database is required')
const postgres = url ? describe : describe.skip
const uuid = { type: 'uuid' as const }
const text = { type: 'varchar' as const, nullable: true }
const scope = { id: { ...uuid, primary: true }, tenantId: uuid, organizationId: uuid }
const actor = { tenantId: randomUUID(), organizationId: randomUUID(), userId: randomUUID() }
const assistantId = randomUUID(),
    libraryId = randomUUID(),
    providerId = randomUUID()
const embeddingId = randomUUID(),
    rerankId = randomUUID()
const embedding = { copilotId: providerId, model: 'embedding', modelType: AiModelTypeEnum.TEXT_EMBEDDING }
const rerank = { copilotId: providerId, model: 'rerank', modelType: AiModelTypeEnum.RERANK }

postgres('published Assistant knowledge model bindings on PostgreSQL', () => {
    let db: DataSource, module: TestingModule, bus: CommandBus
    const schema = `knowledge_model_${randomUUID().replace(/-/g, '')}`
    const revoked = new Set<string>()
    const findOneForSearch = jest.fn(async (id: string, options: FindOneOptions<Knowledgebase>) => {
        if (revoked.has(id)) throw new ForbiddenException()
        return db.getRepository(Knowledgebase).findOneOrFail({ ...options, where: { id } })
    })

    beforeAll(async () => {
        db = new DataSource({
            type: 'postgres',
            url,
            schema,
            extra: { options: '-c search_path=' + schema + ',public', statement_timeout: 10000 },
            entities: [
                new EntitySchema<CopilotModel>({
                    name: CopilotModel.name,
                    target: CopilotModel,
                    tableName: 'copilot_model',
                    columns: { ...scope, copilotId: uuid, model: text, modelType: text }
                }),
                new EntitySchema<Xpert>({
                    name: Xpert.name,
                    target: Xpert,
                    tableName: 'xpert',
                    columns: {
                        ...scope,
                        userId: uuid,
                        active: { type: 'boolean' },
                        publishAt: { type: 'timestamptz', nullable: true },
                        deletedAt: { type: 'timestamptz', nullable: true, deleteDate: true },
                        draft: { type: 'jsonb', nullable: true },
                        copilotModelId: { ...uuid, nullable: true }
                    },
                    relations: {
                        agent: { type: 'one-to-one', target: XpertAgent.name, inverseSide: 'xpert' },
                        agents: { type: 'one-to-many', target: XpertAgent.name, inverseSide: 'team' },
                        copilotModel: {
                            type: 'one-to-one',
                            target: CopilotModel.name,
                            joinColumn: { name: 'copilotModelId' }
                        },
                        knowledgebases: {
                            type: 'many-to-many',
                            target: Knowledgebase.name,
                            inverseSide: 'xperts',
                            joinTable: { name: 'xpert_to_knowledgebase' }
                        }
                    }
                }),
                new EntitySchema<XpertAgent>({
                    name: XpertAgent.name,
                    target: XpertAgent,
                    tableName: 'xpert_agent',
                    columns: {
                        ...scope,
                        key: text,
                        xpertId: { ...uuid, nullable: true },
                        teamId: { ...uuid, nullable: true },
                        copilotModelId: { ...uuid, nullable: true }
                    },
                    relations: {
                        xpert: { type: 'one-to-one', target: Xpert.name, joinColumn: { name: 'xpertId' } },
                        team: { type: 'many-to-one', target: Xpert.name, joinColumn: { name: 'teamId' } },
                        copilotModel: {
                            type: 'one-to-one',
                            target: CopilotModel.name,
                            joinColumn: { name: 'copilotModelId' }
                        }
                    }
                }),
                new EntitySchema<Knowledgebase>({
                    name: Knowledgebase.name,
                    target: Knowledgebase,
                    tableName: 'knowledgebase',
                    columns: {
                        ...scope,
                        type: text,
                        deletedAt: { type: 'timestamptz', nullable: true, deleteDate: true },
                        copilotModelId: { ...uuid, nullable: true },
                        rerankModelId: { ...uuid, nullable: true },
                        pendingCopilotModelId: { ...uuid, nullable: true }
                    },
                    relations: {
                        xperts: { type: 'many-to-many', target: Xpert.name, inverseSide: 'knowledgebases' },
                        copilotModel: {
                            type: 'many-to-one',
                            target: CopilotModel.name,
                            joinColumn: { name: 'copilotModelId' }
                        },
                        rerankModel: {
                            type: 'many-to-one',
                            target: CopilotModel.name,
                            joinColumn: { name: 'rerankModelId' }
                        }
                    }
                })
            ]
        })
        await db.initialize()
        await db.query(`CREATE SCHEMA "${schema}"`)
        await db.synchronize()
        module = await Test.createTestingModule({
            imports: [CqrsModule],
            providers: [
                ResolveAssistantModelHandler,
                KnowledgebaseGetOneHandler,
                { provide: DataSource, useValue: db },
                { provide: KnowledgebaseService, useValue: { findOneForSearch } },
                {
                    provide: AssistantPrincipalAccessService,
                    useValue: {
                        isPrincipal: async () => true,
                        find: async (scope: typeof actor, target: { assistantId: string }) =>
                            db.getRepository(Xpert).findOneBy({
                                ...scope,
                                id: target.assistantId,
                                active: true,
                                publishAt: Not(IsNull())
                            })
                    }
                }
            ]
        }).compile()
        await module.init()
        bus = module.get(CommandBus)
    })
    afterAll(async () => {
        await module?.close()
        if (db?.isInitialized) {
            await db.query(`DROP SCHEMA "${schema}" CASCADE`)
            await db.destroy()
        }
    })
    beforeEach(async () => {
        jest.spyOn(RequestContext, 'currentTenantId').mockReturnValue(actor.tenantId)
        jest.spyOn(RequestContext, 'getOrganizationId').mockReturnValue(actor.organizationId)
        jest.spyOn(RequestContext, 'currentUserId').mockReturnValue(actor.userId)
        revoked.clear()
        findOneForSearch.mockClear()
        await db.query('TRUNCATE TABLE xpert_to_knowledgebase, knowledgebase, xpert, copilot_model CASCADE')
        const modelScope = { tenantId: actor.tenantId, organizationId: actor.organizationId }
        await db.getRepository(CopilotModel).insert([
            { ...modelScope, id: embeddingId, ...embedding },
            { ...modelScope, id: rerankId, ...rerank }
        ])
        await db.getRepository(Xpert).insert({ ...actor, id: assistantId, active: true, publishAt: new Date() })
        await db.getRepository(Knowledgebase).insert({
            id: libraryId,
            tenantId: actor.tenantId,
            organizationId: actor.organizationId,
            type: KnowledgebaseTypeEnum.Standard,
            copilotModelId: embeddingId,
            rerankModelId: rerankId
        })
        await db.createQueryBuilder().relation(Xpert, 'knowledgebases').of(assistantId).add(libraryId)
    })
    afterEach(() => jest.restoreAllMocks())

    const run = (model = embedding, id = assistantId) => bus.execute(new ResolveAssistantModelCommand(actor, id, model))

    it('resolves live dependencies through the existing Assistant command and knowledge retrieval query', async () => {
        await expect(run()).resolves.toBe(true)
        await expect(run(rerank)).resolves.toBe(true)
        expect(findOneForSearch).toHaveBeenCalledTimes(2)
    })

    it('does not authorize draft-only bindings after the published relation is removed', async () => {
        await db.createQueryBuilder().relation(Xpert, 'knowledgebases').of(assistantId).remove(libraryId)
        await db.getRepository(Xpert).update(assistantId, {
            draft: {
                team: {},
                nodes: [
                    {
                        type: 'knowledge',
                        key: libraryId,
                        position: { x: 0, y: 0 },
                        entity: { id: libraryId, name: 'Draft library', type: KnowledgebaseTypeEnum.Standard }
                    }
                ],
                connections: [{ key: 'draft-binding', type: 'knowledge', from: 'draft-agent', to: libraryId }]
            }
        })
        await expect(run()).rejects.toBeInstanceOf(ForbiddenException)
        expect(findOneForSearch).not.toHaveBeenCalled()
    })

    it.each([
        { tenantId: randomUUID() },
        { organizationId: randomUUID() },
        { userId: randomUUID() },
        { active: false },
        { publishAt: null },
        { deletedAt: new Date() }
    ])('rejects an ineligible Assistant binding: %p', async (patch) => {
        await db.getRepository(Xpert).update(assistantId, patch)
        await expect(run()).rejects.toBeInstanceOf(ForbiddenException)
        expect(findOneForSearch).not.toHaveBeenCalled()
    })

    it.each([{ tenantId: randomUUID() }, { organizationId: randomUUID() }, { deletedAt: new Date() }])(
        'rejects an out-of-scope or deleted library: %p',
        async (patch) => {
            await db.getRepository(Knowledgebase).update(libraryId, patch)
            await expect(run()).rejects.toBeInstanceOf(ForbiddenException)
            expect(findOneForSearch).not.toHaveBeenCalled()
        }
    )

    it('rejects an unrelated Assistant even if the requested model exists', async () => {
        await expect(run(embedding, randomUUID())).rejects.toBeInstanceOf(ForbiddenException)
    })

    it('revalidates the resource read permission for every invocation', async () => {
        await expect(run()).resolves.toBe(true)
        revoked.add(libraryId)
        await expect(run()).rejects.toBeInstanceOf(ForbiddenException)
    })

    it('does not grant a pending rebuild model or retain a removed rerank model', async () => {
        await db.getRepository(Knowledgebase).update(libraryId, {
            copilotModelId: null,
            pendingCopilotModelId: embeddingId,
            rerankModelId: null
        })
        await expect(run()).rejects.toBeInstanceOf(ForbiddenException)
        await expect(run(rerank)).rejects.toBeInstanceOf(ForbiddenException)
    })
})
