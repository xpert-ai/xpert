jest.mock('@xpert-ai/plugin-sdk', () => ({
    RequestContext: {
        currentTenantId: () => 'tenant',
        getOrganizationId: () => 'organization',
        currentUserId: () => 'user'
    }
}))
jest.mock('../xpert-agent/xpert-agent.entity', () => ({ XpertAgent: class XpertAgent {} }))
jest.mock('../knowledge-document/document.entity', () => ({ KnowledgeDocument: class KnowledgeDocument {} }))
jest.mock('./entities', () => ({
    KnowledgeGraphEntity: class KnowledgeGraphEntity {},
    KnowledgeGraphEntityContribution: class KnowledgeGraphEntityContribution {},
    KnowledgeGraphIndexJob: class KnowledgeGraphIndexJob {},
    KnowledgeGraphRelation: class KnowledgeGraphRelation {},
    KnowledgeGraphRelationContribution: class KnowledgeGraphRelationContribution {}
}))
import { KnowledgebaseTypeEnum } from '@xpert-ai/contracts'
import { DataSource, SelectQueryBuilder, Entity, Column, PrimaryColumn, type ColumnType } from 'typeorm'
import { BoundedGraphReader } from './bounded-graph-reader'
import { XpertAgent } from '../xpert-agent/xpert-agent.entity'
import { KnowledgeDocument } from '../knowledge-document/document.entity'
import {
    KnowledgeGraphEntity,
    KnowledgeGraphRelation,
    KnowledgeGraphEntityContribution,
    KnowledgeGraphIndexJob,
    KnowledgeGraphRelationContribution
} from './entities'
import type { KnowledgebaseService } from '../knowledgebase/knowledgebase.service'

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
function fixture() {
    const ds = new DataSource({ type: 'postgres', driver: {} })
    const agent = Object.assign(new XpertAgent(), { knowledgebaseIds: [id(1)] })
    const agentRead = jest.spyOn(ds.getRepository(XpertAgent), 'findOne').mockResolvedValue(agent)
    const document = Object.assign(new KnowledgeDocument(), { id: id(2), contentHash: 'hash', publicationEpoch: 1 })
    jest.spyOn(ds.getRepository(KnowledgeDocument), 'findOneBy').mockResolvedValue(document)
    const job = Object.assign(new KnowledgeGraphIndexJob(), {
        status: 'success',
        sourceContentHash: 'hash',
        sourcePublicationEpoch: 1,
        extractionSnapshot: { publication: { sourceVersion: 'R1:hash' } }
    })
    jest.spyOn(ds.getRepository(KnowledgeGraphIndexJob), 'findOne').mockResolvedValue(job)
    const knowledgebase = {
        name: 'Neutral graph',
        type: KnowledgebaseTypeEnum.Standard,
        id: id(1),
        tenantId: 'tenant',
        organizationId: 'organization',
        graphRag: { enabled: true }
    }
    const findOneByIdString = jest
        .fn<
            ReturnType<KnowledgebaseService['findOneByIdString']>,
            Parameters<KnowledgebaseService['findOneByIdString']>
        >()
        .mockResolvedValue(knowledgebase)
    const qb = new SelectQueryBuilder<KnowledgeGraphEntityContribution>(ds)
    for (const method of [
        'innerJoinAndMapOne',
        'innerJoin',
        'where',
        'andWhere',
        'orderBy',
        'addOrderBy',
        'take',
        'limit',
        'distinctOn'
    ] as const)
        jest.spyOn(qb, method).mockReturnValue(qb)
    const rows = jest
        .spyOn(qb, 'getMany')
        .mockResolvedValue([
            Object.assign(new KnowledgeGraphEntityContribution(), {
                entityId: id(3),
                name: 'Neutral bearing',
                sourceDocumentIdSnapshot: id(2),
                properties: {},
                entity: { type: 'Material' }
            })
        ])
    jest.spyOn(ds.getRepository(KnowledgeGraphEntityContribution), 'createQueryBuilder').mockReturnValue(qb)
    return {
        ds,
        reader: new BoundedGraphReader(ds.manager, { findOneByIdString }),
        agent,
        agentRead,
        document,
        job,
        knowledgebase,
        rows,
        qb,
        input: {
            knowledgebaseId: id(1),
            xpertId: id(4),
            agentKey: 'Agent_Automotive',
            sources: [{ documentId: id(2), sourceVersion: 'R1:hash' }]
        }
    }
}
it('requires the current scoped Agent to have the requested knowledgebase binding', async () => {
    const f = fixture()
    f.agent.knowledgebaseIds = []
    await expect(f.reader.query(f.input)).rejects.toMatchObject({ status: 403 })
    expect(f.rows).not.toHaveBeenCalled()
    expect(f.agentRead).toHaveBeenCalledWith({
        where: { xpertId: id(4), key: 'Agent_Automotive', tenantId: 'tenant', organizationId: 'organization' }
    })
})
it('rejects cross-organization and oversized queries before reading graph facts', async () => {
    const f = fixture()
    f.knowledgebase.organizationId = 'other'
    await expect(f.reader.query(f.input)).rejects.toMatchObject({ status: 403 })
    await expect(f.reader.query({ ...f.input, limit: 101 })).rejects.toMatchObject({ status: 400 })
    await expect(
        f.reader.neighborhood({ ...f.input, entityIds: [id(3)], relationTypes: ['CONTAINS'], depth: 3 })
    ).rejects.toMatchObject({ status: 400 })
    expect(f.rows).not.toHaveBeenCalled()
})
it('reports queued and stale sources without returning their entities', async () => {
    const f = fixture()
    Object.assign(f.job, { status: 'queued' })
    expect(await f.reader.query(f.input)).toMatchObject({ entities: [], sources: [{ status: 'queued' }] })
    f.document.publicationEpoch = 2
    expect(await f.reader.query(f.input)).toMatchObject({ entities: [], sources: [{ status: 'stale' }] })
    expect(f.rows).not.toHaveBeenCalled()
})
it('returns only current contributions and rechecks versions after the bounded read', async () => {
    const f = fixture()
    expect(await f.reader.query({ ...f.input, search: 'bearing', limit: 1 })).toMatchObject({
        entities: [{ id: id(3) }],
        truncated: false,
        sources: [{ status: 'success' }]
    })
    expect(f.qb.innerJoin).toHaveBeenCalledWith(
        KnowledgeDocument,
        'd',
        expect.stringContaining('d.contentHash = c.sourceContentHash')
    )
    f.rows.mockImplementation(async () => {
        f.document.publicationEpoch++
        return []
    })
    expect(await f.reader.query(f.input)).toMatchObject({ entities: [], sources: [{ status: 'stale' }] })
})

it('normalizes public entity and relation types exactly as the graph writer does', async () => {
    const f = fixture()
    await f.reader.query({ ...f.input, type: ' Root ' })
    expect(f.qb.andWhere).toHaveBeenCalledWith('e.type = :type', { type: 'root' })
    const relations = new SelectQueryBuilder<KnowledgeGraphRelationContribution>(f.ds)
    for (const method of [
        'innerJoinAndMapOne',
        'innerJoin',
        'where',
        'andWhere',
        'orderBy',
        'addOrderBy',
        'take',
        'limit',
        'distinctOn'
    ] as const)
        jest.spyOn(relations, method).mockReturnValue(relations)
    jest.spyOn(relations, 'getMany').mockResolvedValue([])
    jest.spyOn(f.ds.getRepository(KnowledgeGraphRelationContribution), 'createQueryBuilder').mockReturnValue(relations)
    await f.reader.neighborhood({
        ...f.input,
        entityIds: [id(3)],
        relationTypes: ['CONTAINS', 'USES_MATERIAL'],
        depth: 2
    })
    expect(relations.andWhere).toHaveBeenCalledWith(expect.stringContaining('r.type IN'), {
        types: ['contains', 'uses_material']
    })
})

const pgSuite = process.env.BOM_GRAPH_PG === '1' ? describe : describe.skip
pgSuite('bounded graph pagination in PostgreSQL', () => {
    let ds: DataSource, control: DataSource, reader: BoundedGraphReader
    const schema = `graph_read_${Date.now()}`
    const input = {
        knowledgebaseId: id(1),
        xpertId: id(4),
        agentKey: 'Agent_Automotive',
        sources: [
            { documentId: id(2), sourceVersion: 'R1:hash' },
            { documentId: id(6), sourceVersion: 'R1:hash' }
        ]
    }
    beforeAll(async () => {
        const fs = await import('node:fs'),
            dotenv = await import('dotenv'),
            env = dotenv.parse(fs.readFileSync('.env'))
        const options = {
            type: 'postgres' as const,
            host: env.DB_HOST,
            port: Number(env.DB_PORT),
            username: env.DB_USER,
            password: env.DB_PASS,
            database: env.DB_NAME
        }
        const define = (target: Function, name: string, fields: Record<string, ColumnType>) => {
            Entity(name)(target)
            PrimaryColumn({ type: 'uuid' })(target.prototype, 'id')
            for (const [key, type] of Object.entries(fields)) Column({ type, nullable: true })(target.prototype, key)
        }
        define(KnowledgeDocument, 'document', {
            knowledgebaseId: 'uuid',
            contentHash: 'varchar',
            publicationEpoch: 'integer',
            tenantId: 'varchar',
            organizationId: 'varchar'
        })
        define(KnowledgeGraphEntity, 'entity', { knowledgebaseId: 'uuid', type: 'varchar', visibility: 'varchar' })
        define(KnowledgeGraphRelation, 'relation', {
            knowledgebaseId: 'uuid',
            sourceEntityId: 'uuid',
            targetEntityId: 'uuid',
            type: 'varchar',
            visibility: 'varchar'
        })
        const common = {
            knowledgebaseId: 'uuid',
            sourceDocumentIdSnapshot: 'uuid',
            sourceContentHash: 'varchar',
            sourcePublicationEpoch: 'integer',
            properties: 'jsonb'
        } satisfies Record<string, ColumnType>
        define(KnowledgeGraphEntityContribution, 'entity_contribution', {
            ...common,
            entityId: 'uuid',
            name: 'varchar',
            aliases: 'jsonb'
        })
        define(KnowledgeGraphRelationContribution, 'relation_contribution', { ...common, relationId: 'uuid' })
        control = await new DataSource(options).initialize()
        await control.query(`CREATE SCHEMA "${schema}"`)
        ds = await new DataSource({
            ...options,
            schema,
            entities: [
                KnowledgeDocument,
                KnowledgeGraphEntity,
                KnowledgeGraphEntityContribution,
                KnowledgeGraphRelation,
                KnowledgeGraphRelationContribution
            ],
            synchronize: true
        }).initialize()
        const documents = [id(2), id(6)]
        await ds
            .getRepository(KnowledgeDocument)
            .save(
                documents.map((documentId) =>
                    Object.assign(new KnowledgeDocument(), {
                        id: documentId,
                        knowledgebaseId: id(1),
                        contentHash: 'hash',
                        publicationEpoch: 1,
                        tenantId: 'tenant',
                        organizationId: 'organization'
                    })
                )
            )
        jest.spyOn(ds.getRepository(XpertAgent), 'findOne').mockResolvedValue(
            Object.assign(new XpertAgent(), { knowledgebaseIds: [id(1)] })
        )
        jest.spyOn(ds.getRepository(KnowledgeGraphIndexJob), 'findOne').mockResolvedValue(
            Object.assign(new KnowledgeGraphIndexJob(), {
                status: 'success',
                sourceContentHash: 'hash',
                sourcePublicationEpoch: 1,
                extractionSnapshot: { publication: { sourceVersion: 'R1:hash' } }
            })
        )
        const findOneByIdString = jest
            .fn<
                ReturnType<KnowledgebaseService['findOneByIdString']>,
                Parameters<KnowledgebaseService['findOneByIdString']>
            >()
            .mockResolvedValue({
                name: 'Neutral automotive graph',
                type: KnowledgebaseTypeEnum.Standard,
                id: id(1),
                tenantId: 'tenant',
                organizationId: 'organization',
                graphRag: { enabled: true }
            })
        reader = new BoundedGraphReader(ds.manager, { findOneByIdString })
        for (let i = 0; i <= 105; i++) {
            await ds
                .getRepository(KnowledgeGraphEntity)
                .save(
                    Object.assign(new KnowledgeGraphEntity(), {
                        id: id(100 + i),
                        knowledgebaseId: id(1),
                        type: 'component',
                        visibility: 'active'
                    })
                )
            for (let d = 0; d < 2; d++)
                await ds
                    .getRepository(KnowledgeGraphEntityContribution)
                    .save(
                        Object.assign(new KnowledgeGraphEntityContribution(), {
                            id: id(1000 + i * 2 + d),
                            knowledgebaseId: id(1),
                            entityId: id(100 + i),
                            name: `Neutral bearing ${i}`,
                            aliases: [],
                            properties: {},
                            sourceDocumentIdSnapshot: documents[d],
                            sourceContentHash: 'hash',
                            sourcePublicationEpoch: 1
                        })
                    )
            if (!i) continue
            await ds
                .getRepository(KnowledgeGraphRelation)
                .save(
                    Object.assign(new KnowledgeGraphRelation(), {
                        id: id(2000 + i),
                        knowledgebaseId: id(1),
                        type: 'contains',
                        sourceEntityId: id(100),
                        targetEntityId: id(100 + i),
                        visibility: 'active'
                    })
                )
            for (let d = 0; d < 2; d++)
                await ds
                    .getRepository(KnowledgeGraphRelationContribution)
                    .save(
                        Object.assign(new KnowledgeGraphRelationContribution(), {
                            id: id(3000 + i * 2 + d),
                            knowledgebaseId: id(1),
                            relationId: id(2000 + i),
                            properties: {},
                            sourceDocumentIdSnapshot: documents[d],
                            sourceContentHash: 'hash',
                            sourcePublicationEpoch: 1
                        })
                    )
        }
    }, 30000)
    afterAll(async () => {
        if (ds?.isInitialized) await ds.destroy()
        if (control?.isInitialized) {
            await control.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`)
            await control.destroy()
        }
    })
    it('deduplicates logical entities before LIMIT, preserves source provenance, and resumes without gaps', async () => {
        const first = await reader.query({ ...input, limit: 50 })
        expect(first.entities).toHaveLength(50)
        expect(new Set(first.entities.map((e) => e.id)).size).toBe(50)
        expect(first.entities.every((e) => e.documentIds?.length === 2)).toBe(true)
        const second = await reader.query({ ...input, limit: 50, cursor: first.nextCursor })
        expect(second.entities[0].id).toBe(id(150))
        const third = await reader.query({ ...input, limit: 50, cursor: second.nextCursor })
        expect(third.entities).toHaveLength(6)
        expect(third.truncated).toBe(false)
        await expect(
            reader.query({ ...input, type: 'material', limit: 50, cursor: first.nextCursor })
        ).rejects.toMatchObject({ status: 400 })
        await expect(
            reader.query({
                ...input,
                sources: [{ documentId: id(2), sourceVersion: 'R2:hash' }],
                limit: 50,
                cursor: first.nextCursor
            })
        ).rejects.toMatchObject({ status: 400 })
    })
    it('returns complete endpoints with every bounded directional relation page, including the last page', async () => {
        const query = {
            ...input,
            entityIds: [id(100)],
            relationTypes: ['CONTAINS'],
            direction: 'outgoing' as const,
            depth: 1,
            limit: 100
        }
        const first = await reader.neighborhood(query)
        expect(first.relations).toHaveLength(100)
        expect(first.entities).toHaveLength(101)
        expect(first.relations.every((r) => r.documentIds?.length === 2)).toBe(true)
        const second = await reader.neighborhood({ ...query, cursor: first.nextCursor })
        expect(second.relations).toHaveLength(5)
        expect(second.entities).toHaveLength(6)
        expect(second.truncated).toBe(false)
        const parent = await reader.neighborhood({ ...query, direction: 'incoming', entityIds: [id(205)], limit: 1 })
        expect(parent.relations).toHaveLength(1)
        expect(parent.entities).toHaveLength(2)
        expect(parent.relations[0].source).toBe(id(100))
        await expect(
            reader.neighborhood({ ...query, direction: 'incoming', cursor: first.nextCursor })
        ).rejects.toMatchObject({ status: 400 })
    })
})
