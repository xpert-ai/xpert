import { NotFoundException } from '@nestjs/common'
import { CqrsModule, QueryBus } from '@nestjs/cqrs'
import { Test } from '@nestjs/testing'
import { createNamespace, getNamespace } from 'cls-hooked'
import { isEqual } from 'lodash'
import { DataSource, EntitySchema, IsNull, type FindOneOptions, type Repository } from 'typeorm'
import { XpertAgentExecution } from '../../agent-execution.entity'
import { XpertAgentExecutionService } from '../../agent-execution.service'
import { GetAgentExecutionRunSummaryQuery } from '../get-run-summary.query'
import { GetAgentExecutionRunSummaryHandler } from './get-run-summary.handler'
import { QueryHandlers } from './index'

class QueryDataSource extends DataSource {
    prepare() {
        return this.buildMetadatas()
    }
}

describe('GetAgentExecutionRunSummaryHandler', () => {
    const execution = Object.assign(new XpertAgentExecution(), {
        id: 'run',
        tenantId: 'tenant',
        organizationId: 'org',
        threadId: 'thread',
        xpertId: 'assistant',
        inputs: { input: 'Review' },
        metadata: { assistantName: 'Reviewer' },
        status: 'running',
        createdAt: new Date('2026-10-12T08:00:00Z'),
        updatedAt: new Date('2026-10-12T08:00:00Z')
    })
    let findOne: jest.Mock<Promise<XpertAgentExecution | null>, [FindOneOptions<XpertAgentExecution>]>
    let handler: GetAgentExecutionRunSummaryHandler
    let tenantId: string
    let organizationId: string | null
    let persisted: XpertAgentExecution | null

    function read(id = 'run') {
        // Exercise the request context used by the existing scoped CRUD service.
        const namespace = getNamespace('RequestContext') ?? createNamespace('RequestContext')
        return namespace.runPromise(async () => {
            namespace.set('RequestContext', {
                request: {
                    user: { id: 'user', tenantId },
                    headers: organizationId ? { 'organization-id': organizationId } : {}
                }
            })
            return handler.execute(new GetAgentExecutionRunSummaryQuery(id))
        })
    }

    beforeEach(() => {
        tenantId = 'tenant'
        organizationId = 'org'
        persisted = Object.assign(new XpertAgentExecution(), execution)
        findOne = jest.fn(async (options) => {
            const where = options.where
            if (!where || Array.isArray(where)) throw new Error('Expected one scoped read')
            const organizationMatches = isEqual(where.organizationId, persisted?.organizationId ?? IsNull())
            return where.id === persisted?.id &&
                isEqual(where.tenant, { id: persisted?.tenantId }) &&
                organizationMatches
                ? persisted
                : null
        })
        const service = new XpertAgentExecutionService({ findOne } as unknown as Repository<XpertAgentExecution>)
        handler = new GetAgentExecutionRunSummaryHandler(service)
    })

    afterEach(() => jest.restoreAllMocks())

    it('returns the persisted run through the tenant and organization scoped service', async () => {
        await expect(read()).resolves.toEqual(execution)
        expect(findOne).toHaveBeenCalledTimes(1)
        expect(findOne.mock.calls[0][0].where).toEqual({
            id: 'run',
            tenant: { id: 'tenant' },
            organizationId: 'org'
        })
    })

    it('keeps tenant-level runs restricted to the null organization scope', async () => {
        organizationId = null
        persisted.organizationId = null
        await read()
        expect(findOne.mock.calls[0][0].where).toEqual({
            id: 'run',
            tenant: { id: 'tenant' },
            organizationId: IsNull()
        })
    })

    it.each([
        ['missing run', 'missing-run', 'tenant', 'org'],
        ['another tenant', 'run', 'other-tenant', 'org'],
        ['another organization', 'run', 'tenant', 'other-org'],
        ['tenant scope reading an organization run', 'run', 'tenant', null]
    ])('preserves the scoped not-found response for %s', async (_name, id, currentTenant, currentOrganization) => {
        tenantId = currentTenant
        organizationId = currentOrganization
        await expect(read(id)).rejects.toThrow(NotFoundException)
        expect(findOne.mock.calls[0][0].where).toEqual({
            id,
            tenant: { id: currentTenant },
            organizationId: currentOrganization ?? IsNull()
        })
    })

    it('propagates database errors instead of falling back to an unscoped or full-detail read', async () => {
        const error = new Error('Database unavailable')
        findOne.mockRejectedValue(error)
        await expect(read()).rejects.toBe(error)
        expect(findOne).toHaveBeenCalledTimes(1)
    })

    it('registers the summary handler for CQRS dispatch in the execution module', async () => {
        const module = await Test.createTestingModule({
            imports: [CqrsModule],
            providers: [
                ...QueryHandlers.filter((candidate) => candidate === GetAgentExecutionRunSummaryHandler),
                {
                    provide: XpertAgentExecutionService,
                    useValue: new XpertAgentExecutionService({ findOne } as unknown as Repository<XpertAgentExecution>)
                }
            ]
        }).compile()
        await module.init()
        // Database behavior is covered above; this checks discovery and constructor injection.
        findOne.mockResolvedValue(execution)
        try {
            await expect(module.get(QueryBus).execute(new GetAgentExecutionRunSummaryQuery('run'))).resolves.toEqual(
                execution
            )
        } finally {
            await module.close()
        }
    })

    it('selects only run response fields and the avatar fallback in generated PostgreSQL', async () => {
        await read()
        const options = findOne.mock.calls[0][0]
        const source = new QueryDataSource({
            type: 'postgres',
            entities: [
                new EntitySchema({
                    name: 'SummaryTenant',
                    columns: { id: { type: String, primary: true } }
                }),
                new EntitySchema({
                    name: 'SummaryTag',
                    columns: { id: { type: String, primary: true }, name: { type: String } }
                }),
                new EntitySchema<{
                    id: string
                    avatar: object
                    graph: object
                    draft: object
                    deletedAt: Date
                    tags: { id: string; name: string }[]
                }>({
                    name: 'SummaryAssistant',
                    columns: {
                        id: { type: String, primary: true },
                        avatar: { type: 'json' },
                        graph: { type: 'json' },
                        draft: { type: 'json' },
                        deletedAt: { type: Date, deleteDate: true }
                    },
                    relations: {
                        tags: { type: 'many-to-many', target: 'SummaryTag', eager: true, joinTable: true }
                    }
                }),
                new EntitySchema<XpertAgentExecution>({
                    name: 'XpertAgentExecution',
                    target: XpertAgentExecution,
                    tableName: 'xpert_agent_execution',
                    columns: {
                        id: { type: String, primary: true },
                        tenantId: { type: String },
                        organizationId: { type: String, nullable: true },
                        threadId: { type: String },
                        parentId: { type: String },
                        xpertId: { type: String },
                        type: { type: String },
                        category: { type: String },
                        agentKey: { type: String },
                        title: { type: String },
                        status: { type: String },
                        error: { type: String },
                        elapsedTime: { type: 'numeric' },
                        inputs: { type: 'json' },
                        metadata: { type: 'json' },
                        createdAt: { type: Date },
                        updatedAt: { type: Date },
                        messages: { type: 'json' },
                        outputs: { type: 'json' },
                        checkpointId: { type: String },
                        checkpointNs: { type: String },
                        tokens: { type: Number }
                    },
                    relations: {
                        tenant: { type: 'many-to-one', target: 'SummaryTenant', joinColumn: { name: 'tenantId' } },
                        xpert: { type: 'many-to-one', target: 'SummaryAssistant', joinColumn: { name: 'xpertId' } }
                    }
                })
            ]
        })
        await source.prepare()
        const [sql, parameters] = source
            .getRepository(XpertAgentExecution)
            .createQueryBuilder('execution')
            .setFindOptions(options)
            .getQueryAndParameters()

        for (const field of [
            'id',
            'threadId',
            'parentId',
            'xpertId',
            'type',
            'category',
            'agentKey',
            'title',
            'status',
            'error',
            'elapsedTime',
            'inputs',
            'metadata',
            'createdAt',
            'updatedAt'
        ]) {
            expect(sql).toContain(`"execution"."${field}" AS`)
        }
        expect(sql).toContain('"avatar" AS')
        expect(sql).toContain('"deletedAt" IS NULL')
        for (const field of ['messages', 'outputs', 'checkpointId', 'checkpointNs', 'tokens', 'graph', 'draft']) {
            expect(sql).not.toContain(`"${field}"`)
        }
        expect(sql).not.toContain('createdBy')
        expect(sql).not.toContain('copilot_checkpoint')
        expect(sql).not.toContain('membership_point_ledger')
        expect(sql).not.toContain('summary_tag')
        expect(parameters).toEqual(expect.arrayContaining(['run', 'tenant', 'org']))
    })
})
