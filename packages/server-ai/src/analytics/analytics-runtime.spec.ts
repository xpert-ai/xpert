import { INestApplication, BadRequestException } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import { CommandBus } from '@nestjs/cqrs'
import type { AnalyticsBinding, AnalyticsSourceRef } from '@xpert-ai/contracts'
import {
    AnalyticsProviderRegistry,
    RequestContext,
    SandboxJobRuntimeError,
    AnalyticsProviderError,
    type AnalyticsQueryProvider,
    type AnalyticsProviderContext,
    type AnalyticsProviderResult
} from '@xpert-ai/plugin-sdk'
import {
    AnalyticsRuntimeService,
    ANALYTICS_SOURCE_RESOLVERS
} from '../../../server/src/analytics/analytics-runtime.service'
import { AnalyticsController } from '../../../server/src/analytics/analytics.controller'
import { ToolNode } from '../xpert-agent/commands/handlers/tool_node'
import { tool } from '@langchain/core/tools'
import { z } from 'zod/v3'

jest.mock('i18next', () => ({ t: (_key: string, options: { defaultValue: string }) => options.defaultValue }))
jest.mock('@langchain/core/callbacks/dispatch', () => ({ dispatchCustomEvent: jest.fn() }))

const uuid = 'a1234567-1234-4234-8234-123456789012'
const actor = { tenantId: 'tenant', organizationId: 'org', userId: 'viewer' }
const source: AnalyticsSourceRef = { kind: 'definition', definitionId: uuid, versionId: uuid }
const binding: AnalyticsBinding = {
    id: 'sales',
    source,
    providerId: 'file.table',
    operation: 'query',
    contractVersion: 1,
    payload: {},
    parameters: [],
    output: {
        datasetId: 'sales',
        grain: [],
        fields: [
            {
                id: 'amount',
                sourceField: 'amount',
                label: 'Amount',
                logicalType: 'decimal',
                role: 'measure',
                nullable: false
            }
        ]
    }
}
const result: AnalyticsProviderResult = {
    columns: [{ key: 'amount' }],
    rows: [{ amount: '12.50' }],
    sourceFetchedAt: '2026-10-21T00:00:00Z',
    completeness: {
        returnedRows: 1,
        totalAccuracy: 'exact',
        totalRows: 1,
        scope: 'full_query_result',
        truncated: false
    }
}
describe('one Analytics Runtime for governed sources', () => {
    let app: INestApplication, runtime: AnalyticsRuntimeService
    const execute = jest.fn(),
        discover = jest.fn(),
        resolve = jest.fn(),
        revalidate = jest.fn(),
        list = jest.fn(),
        groupBinding = jest.fn()
    const provider: AnalyticsQueryProvider = {
        descriptor: {
            id: 'file.table',
            name: 'Files',
            sourceKinds: ['definition', 'artifact', 'data-source'],
            operations: [{ name: 'query', contractVersion: 1, readOnly: true }]
        },
        execute,
        discover
    }
    beforeEach(async () => {
        jest.spyOn(RequestContext, 'currentTenantId').mockReturnValue(actor.tenantId)
        jest.spyOn(RequestContext, 'getOrganizationId').mockReturnValue(actor.organizationId)
        jest.spyOn(RequestContext, 'currentUserId').mockReturnValue(actor.userId)
        delete provider.authorizeResultReuse
        list.mockReset().mockReturnValue([provider])
        groupBinding.mockReset()
        execute.mockReset().mockResolvedValue(result)
        revalidate.mockReset().mockResolvedValue(undefined)
        resolve.mockReset().mockImplementation(async (_actor, ref) => ({
            source: ref,
            providerIds: ['file.table'],
            options: { private: 'secret' },
            revalidate
        }))
        discover.mockReset().mockResolvedValue({
            items: [],
            queryContract: { operation: 'query', contractVersion: 1, payloadSchema: {}, instructions: 'Read' }
        })
        const module = await Test.createTestingModule({
            controllers: [AnalyticsController],
            providers: [
                AnalyticsRuntimeService,
                { provide: CommandBus, useValue: { execute: groupBinding } },
                { provide: AnalyticsProviderRegistry, useValue: { list } },
                {
                    provide: ANALYTICS_SOURCE_RESOLVERS,
                    useValue: ['definition', 'artifact', 'data-source'].map((kind) => ({
                        kind,
                        resolve,
                        list: async () => []
                    }))
                }
            ]
        }).compile()
        runtime = module.get(AnalyticsRuntimeService)
        app = module.createNestApplication()
        await app.listen(0, '127.0.0.1')
    })
    afterEach(async () => {
        await app.close()
        jest.restoreAllMocks()
    })
    async function post(body: unknown) {
        const response = await fetch(`${await app.getUrl()}/analytics/query`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        })
        return { status: response.status, body: await response.json() }
    }
    it.each<AnalyticsSourceRef>([
        source,
        { kind: 'artifact', artifactId: uuid, versionId: uuid },
        { kind: 'data-source', dataSourceId: uuid }
    ])('executes $kind through the same source checks and normalization', async (ref) => {
        const response = await post({ binding: { ...binding, source: ref }, controls: {} })
        expect(response.status).toBe(201)
        expect(response.body.rows).toEqual([{ amount: '12.50' }])
        expect(revalidate).toHaveBeenCalledTimes(1)
        expect(execute).toHaveBeenCalledWith(
            expect.objectContaining({ source: ref }),
            {},
            expect.objectContaining({ actor, source: ref, options: { private: 'secret' } })
        )
    })
    it('keeps caching opt-in and unsupported providers fresh', async () => {
        await runtime.query(actor, { binding, controls: {}, cache: { maxAgeMs: 60000 } })
        await runtime.query(actor, { binding, controls: {}, cache: { maxAgeMs: 60000 } })
        provider.authorizeResultReuse = jest.fn().mockResolvedValue({ sourceVersion: 'v1' })
        await runtime.query(actor, { binding, controls: {} })
        await runtime.query(actor, { binding, controls: {} })
        expect(execute).toHaveBeenCalledTimes(4)
    })
    it('reauthorizes each hit and retains original execution timestamps and immutable copies', async () => {
        const proof = jest.fn().mockResolvedValue({ sourceVersion: 'v1' })
        provider.authorizeResultReuse = proof
        execute.mockResolvedValue({ ...result, sourceVersion: 'v1' })
        const input = { binding, controls: {}, cache: { maxAgeMs: 60000 } }
        const first = await runtime.query(actor, input)
        const original = structuredClone(first)
        first.rows[0].amount = '999'
        expect(await runtime.query(actor, input)).toEqual(original)
        expect(execute).toHaveBeenCalledTimes(1)
        expect(proof).toHaveBeenCalledTimes(5)
        proof.mockRejectedValue(new Error('revoked'))
        await expect(runtime.query(actor, input)).rejects.toThrow()
        expect(execute).toHaveBeenCalledTimes(1)
    })
    it('invalidates on source changes and never releases a result revoked during cache retrieval', async () => {
        const proof = jest.fn().mockResolvedValue({ sourceVersion: 'v1' })
        provider.authorizeResultReuse = proof
        execute.mockResolvedValue({ ...result, sourceVersion: 'v1' })
        const input = { binding, controls: {}, cache: { maxAgeMs: 60000 } }
        await runtime.query(actor, input)
        proof.mockResolvedValueOnce({ sourceVersion: 'v1' }).mockRejectedValueOnce(new Error('revoked'))
        await expect(runtime.query(actor, input)).rejects.toThrow()
        proof.mockResolvedValue({ sourceVersion: 'v2' })
        execute.mockResolvedValue({ ...result, sourceVersion: 'v2' })
        expect((await runtime.query(actor, input)).provenance.sourceVersion).toBe('v2')
        expect(execute).toHaveBeenCalledTimes(2)
    })
    it('partitions identity, resolved source options and parameters, and honors force refresh', async () => {
        provider.authorizeResultReuse = jest.fn().mockResolvedValue({ sourceVersion: 'v1' })
        execute.mockResolvedValue({ ...result, sourceVersion: 'v1' })
        const input = { binding, controls: {}, cache: { maxAgeMs: 60000 } }
        await runtime.query(actor, input)
        await runtime.query(actor, { ...input, cache: { ...input.cache, forceRefresh: true } })
        jest.spyOn(RequestContext, 'currentUserId').mockReturnValue('second-viewer')
        await runtime.query({ ...actor, userId: 'second-viewer' }, input)
        resolve.mockImplementation(async (_actor, ref) => ({
            source: ref,
            providerIds: ['file.table'],
            options: { private: 'changed' },
            revalidate
        }))
        await runtime.query({ ...actor, userId: 'second-viewer' }, input)
        await runtime.query(
            { ...actor, userId: 'second-viewer' },
            {
                ...input,
                binding: {
                    ...binding,
                    parameters: [{ name: 'region', controlId: 'region', type: 'string', required: true }]
                },
                controls: { region: 'east' }
            }
        )
        expect(execute).toHaveBeenCalledTimes(5)
    })
    it('does not cache provider failures or mismatching source proofs', async () => {
        provider.authorizeResultReuse = jest.fn().mockResolvedValue({ sourceVersion: 'v1' })
        execute
            .mockRejectedValueOnce(new Error('upstream failed'))
            .mockResolvedValueOnce({ ...result, sourceVersion: 'other' })
            .mockResolvedValue({ ...result, sourceVersion: 'v1' })
        const input = { binding, controls: {}, cache: { maxAgeMs: 60000 } }
        await expect(runtime.query(actor, input)).rejects.toThrow()
        await expect(runtime.query(actor, input)).rejects.toThrow()
        await runtime.query(actor, input)
        await runtime.query(actor, input)
        expect(execute).toHaveBeenCalledTimes(3)
    })
    it('invalidates earlier cached results even when force refresh has a zero age budget', async () => {
        provider.authorizeResultReuse = jest.fn().mockResolvedValue({ sourceVersion: 'v1' })
        execute.mockResolvedValue({ ...result, sourceVersion: 'v1' })
        const input = { binding, controls: {}, cache: { maxAgeMs: 60000 } }
        const previous = await runtime.query(actor, input)
        await runtime.query(actor, { ...input, cache: { maxAgeMs: 0, forceRefresh: true } })
        const latest = await runtime.query(actor, input)
        expect(latest.provenance.executionId).not.toBe(previous.provenance.executionId)
        expect(execute).toHaveBeenCalledTimes(3)
    })
    it('keeps a newer cached result when an older superseded query fails', async () => {
        provider.authorizeResultReuse = jest.fn().mockResolvedValue({ sourceVersion: 'v1' })
        let rejectOld!: (reason: Error) => void
        let notifyStarted!: () => void
        const started = new Promise<void>((resolve) => {
            notifyStarted = resolve
        })
        const oldResult = new Promise<AnalyticsProviderResult>((_resolve, reject) => {
            rejectOld = reject
        })
        execute.mockResolvedValue({ ...result, sourceVersion: 'v1' }).mockImplementationOnce(() => {
            notifyStarted()
            return oldResult
        })
        const input = { binding, controls: {}, cache: { maxAgeMs: 60000 } }
        const oldFailure = expect(runtime.query(actor, input)).rejects.toThrow()
        await started
        await runtime.query(actor, { ...input, cache: { ...input.cache, forceRefresh: true } })
        const latest = await runtime.query(actor, input)
        rejectOld(new Error('Old execution failed'))
        await oldFailure
        expect(await runtime.query(actor, input)).toEqual(latest)
        expect(execute).toHaveBeenCalledTimes(3)
    })
    it('reauthorizes each coalesced caller before releasing a shared result', async () => {
        const denied = new Set<string>()
        const authorized: string[] = []
        let release!: (value: AnalyticsProviderResult) => void
        let notifyStarted!: () => void
        const started = new Promise<void>((resolve) => {
            notifyStarted = resolve
        })
        const pending = new Promise<AnalyticsProviderResult>((resolve) => {
            release = resolve
        })
        execute.mockImplementation(() => {
            notifyStarted()
            return pending
        })
        provider.authorizeResultReuse = jest.fn(async (_binding, _parameters, context: AnalyticsProviderContext) => {
            if (denied.has(context.executionId)) throw new Error('revoked')
            authorized.push(context.executionId)
            return { sourceVersion: 'v1' }
        })
        const input = { binding, controls: {}, cache: { maxAgeMs: 60000 } }
        const first = runtime.query(actor, input)
        await started
        const secondFailure = expect(runtime.query(actor, input)).rejects.toThrow()
        await new Promise<void>((resolve) => setImmediate(resolve))
        expect(authorized).toHaveLength(2)
        denied.add(authorized[1])
        release({ ...result, sourceVersion: 'v1' })
        expect((await first).rows).toEqual([{ amount: '12.50' }])
        await secondFailure
        expect(execute).toHaveBeenCalledTimes(1)
    })
    it('does not reuse cached results after replacing a provider instance', async () => {
        provider.authorizeResultReuse = jest.fn().mockResolvedValue({ sourceVersion: 'v1' })
        execute.mockResolvedValue({ ...result, sourceVersion: 'v1' })
        const input = { binding, controls: {}, cache: { maxAgeMs: 60000 } }
        const previous = await runtime.query(actor, input)
        list.mockReturnValue([{ ...provider }])
        const next = await runtime.query(actor, input)
        expect(next.provenance.executionId).not.toBe(previous.provenance.executionId)
        expect(execute).toHaveBeenCalledTimes(2)
    })
    it.each([
        { maxAgeMs: -1 },
        { maxAgeMs: 60001 },
        { maxAgeMs: 1.5 },
        { maxAgeMs: '1000' },
        { maxAgeMs: 1000, forceRefresh: 'true' },
        { maxAgeMs: 1000, actorId: 'someone-else' }
    ])('rejects invalid cache options at the HTTP boundary: %j', async (cache) => {
        const response = await post({ binding, controls: {}, cache })
        expect(response.status).toBe(400)
        expect(execute).not.toHaveBeenCalled()
    })
    it('retains source-specific sharing restrictions without weakening a private provider', async () => {
        const registry = app.get(AnalyticsProviderRegistry)
        const register = list.mockReturnValue([
            {
                ...provider,
                descriptor: {
                    ...provider.descriptor,
                    sharing: { mode: 'viewer_permissions' }
                }
            }
        ])
        const restricted = {
            ...provider.descriptor,
            sharing: { mode: 'owner_only' as const, reasonCode: 'ANALYTICS_DEFINITION_PRIVATE' }
        }
        const service = new AnalyticsRuntimeService(
            registry,
            [
                {
                    kind: 'definition',
                    resolve,
                    list: async () => [{ source, name: 'Private script', providers: [restricted] }]
                }
            ],
            app.get(CommandBus)
        )
        expect((await service.list(actor))[0].providers[0].sharing).toEqual(restricted.sharing)
        register.mockReturnValue([{ ...provider, descriptor: restricted }])
        const publicSource = new AnalyticsRuntimeService(
            registry,
            [
                {
                    kind: 'definition',
                    resolve,
                    list: async () => [
                        {
                            source,
                            name: 'Public source',
                            providers: [{ ...provider.descriptor, sharing: { mode: 'viewer_permissions' } }]
                        }
                    ]
                }
            ],
            app.get(CommandBus)
        )
        expect((await publicSource.list(actor))[0].providers[0].sharing?.mode).toBe('owner_only')
    })
    it('resolves an exact group binding without substituting the requesting human', async () => {
        const grantCheck = jest.fn().mockResolvedValue(undefined)
        const project = jest.fn((dataset) => ({ ...dataset, rows: [] }))
        groupBinding.mockResolvedValue({
            binding,
            source: { source, providerIds: ['file.table'], options: { shared: true }, revalidate },
            revalidate: grantCheck,
            project,
            normalizeControls: async (controls) => controls
        })
        const dataset = await runtime.queryGroupReference(
            actor,
            { groupId: uuid, referenceId: uuid, datasetKey: 'sales' },
            {}
        )
        expect(dataset.rows).toEqual([])
        expect(project).toHaveBeenCalledTimes(1)
        expect(resolve).not.toHaveBeenCalled()
        expect(grantCheck).toHaveBeenCalledTimes(2)
        expect(revalidate).toHaveBeenCalledTimes(1)
        expect(execute).toHaveBeenCalledWith(binding, {}, expect.objectContaining({ actor, options: { shared: true } }))
        expect(groupBinding).toHaveBeenCalledWith(
            expect.objectContaining({ actor, groupId: uuid, referenceId: uuid, datasetKey: 'sales' })
        )
    })
    it('normalizes fixed-version domain controls before parameter checks, without granting native query overrides', async () => {
        const parameterized = {
            ...binding,
            parameters: [
                { name: 'plant', controlId: 'plant', type: 'string' as const, required: true, allowedValues: ['A'] }
            ]
        }
        const normalizeControls = jest.fn(async () => ({ plant: 'A' }))
        groupBinding.mockResolvedValue({
            binding: parameterized,
            revalidate: async () => {},
            project: (dataset) => dataset,
            normalizeControls
        })
        await runtime.queryGroupReference(actor, { groupId: uuid, referenceId: uuid, datasetKey: 'sales' }, {})
        expect(normalizeControls).toHaveBeenCalledWith({})
        expect(execute).toHaveBeenCalledWith(parameterized, { plant: 'A' }, expect.objectContaining({ actor }))
        execute.mockClear()
        normalizeControls.mockResolvedValueOnce({ plant: 'B' })
        await expect(
            runtime.queryGroupReference(actor, { groupId: uuid, referenceId: uuid, datasetKey: 'sales' }, {})
        ).rejects.toThrow()
        expect(execute).not.toHaveBeenCalled()
    })
    it('does not release group results when either the grant or upstream access changes', async () => {
        const grantCheck = jest.fn().mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error('revoked'))
        const project = jest.fn((dataset) => dataset)
        groupBinding.mockResolvedValue({
            binding,
            revalidate: grantCheck,
            project,
            normalizeControls: async (controls) => controls
        })
        await expect(
            runtime.queryGroupReference(actor, { groupId: uuid, referenceId: uuid, datasetKey: 'sales' }, {})
        ).rejects.toThrow('revoked')
        expect(project).not.toHaveBeenCalled()
        grantCheck.mockReset().mockResolvedValue(undefined)
        revalidate.mockRejectedValue(new Error('source denied'))
        await expect(
            runtime.queryGroupReference(actor, { groupId: uuid, referenceId: uuid, datasetKey: 'sales' }, {})
        ).rejects.toThrow()
        expect(project).not.toHaveBeenCalled()
    })
    it.each([
        { ...binding, source: { kind: 'definition', definitionId: uuid } },
        { ...binding, dataSourceId: uuid },
        { ...binding, schemaVersion: 1 },
        { ...binding, source: { ...source, userId: uuid } }
    ])('rejects invalid/obsolete envelopes at HTTP boundary', async (invalid) => {
        expect((await post({ binding: invalid, controls: {} })).status).toBe(400)
        expect(execute).not.toHaveBeenCalled()
    })
    it('denies caller scope substitution and resource/provider mismatches', async () => {
        await expect(runtime.query({ ...actor, userId: 'owner' }, { binding, controls: {} })).rejects.toThrow()
        resolve.mockResolvedValue({ source, providerIds: ['other'], options: {}, revalidate })
        await expect(runtime.query(actor, { binding, controls: {} })).rejects.toThrow()
        expect(execute).not.toHaveBeenCalled()
    })
    it('fails after revocation, version tampering or provider unload', async () => {
        revalidate.mockRejectedValue(new Error('revoked'))
        await expect(runtime.query(actor, { binding, controls: {} })).rejects.toThrow()
        revalidate.mockResolvedValue(undefined)
        execute.mockImplementation(async () => {
            list.mockReturnValue([])
            return result
        })
        await expect(runtime.query(actor, { binding, controls: {} })).rejects.toThrow()
    })
    it('keeps duplicate rows and gives Agent tools an actionable grain error', async () => {
        execute.mockResolvedValue({
            ...result,
            rows: [...result.rows, ...result.rows],
            completeness: { ...result.completeness, returnedRows: 2, totalRows: 2 }
        })
        const duplicate = { ...binding, output: { ...binding.output, grain: ['amount'] } }
        const response = await post({ binding: duplicate, controls: {} })
        expect(response.status).toBe(400)
        expect(response.body.code).toBe('ANALYTICS_GRAIN_MISMATCH')
        expect(response.body.message).toContain('empty grain')
        await expect(runtime.query(actor, { binding: duplicate, controls: {} })).rejects.toThrow(
            'Do not discard source rows'
        )
        const repaired = await post({ binding, controls: {} })
        expect(repaired.status).toBe(201)
        expect(repaired.body.rows).toHaveLength(2)
    })
    it('redacts provider HTTP errors', async () => {
        execute.mockRejectedValue(new BadRequestException('credential-secret'))
        const response = await post({ binding, controls: {} })
        expect(response.status).toBe(400)
        expect(JSON.stringify(response.body)).not.toContain('credential-secret')
    })
    it('preserves public provider diagnostics in discover, HTTP and the tool-facing message', async () => {
        const diagnostic = {
            schema: 'xpert.analytics.diagnostic',
            version: 1,
            code: 'QUERY_FILTER_INVALID',
            stage: 'validation',
            retryable: false,
            message: 'Filter operator is invalid at filters.0.op. Check the discovered schema.',
            upstreamExecutionId: 'upstream-run',
            auditRef: 'audit-run'
        } as const
        execute.mockRejectedValue(new AnalyticsProviderError(diagnostic))
        const response = await post({ binding, controls: {} })
        expect(response.body).toMatchObject({ ...diagnostic, message: expect.stringContaining(diagnostic.message) })
        expect(response.body.executionId).toEqual(expect.any(String))
        discover.mockRejectedValue({ name: 'AnalyticsProviderError', diagnostic, message: 'private driver text' })
        await expect(runtime.discover(actor, { source, providerId: 'file.table', request: {} })).rejects.toMatchObject({
            message: expect.stringContaining(diagnostic.message)
        })
        await expect(runtime.query(actor, { binding, controls: {} })).rejects.toMatchObject({
            message: expect.stringContaining('audit-run')
        })
        const preview = tool(async () => runtime.query(actor, { binding, controls: {} }), {
            name: 'dashboard_preview',
            description: 'Preview',
            schema: z.object({})
        })
        const output = await new ToolNode([preview]).invoke({
            toolCall: { id: 'preview-1', name: 'dashboard_preview', args: {} }
        })
        expect(output).toEqual([
            expect.objectContaining({
                update: expect.objectContaining({
                    messages: [
                        expect.objectContaining({
                            status: 'error',
                            content: expect.stringContaining(diagnostic.message)
                        })
                    ]
                })
            })
        ])
    })
    it('revalidates access before returning a public diagnostic', async () => {
        execute.mockRejectedValue(
            new AnalyticsProviderError({
                schema: 'xpert.analytics.diagnostic',
                version: 1,
                code: 'FILTER_INVALID',
                stage: 'validation',
                retryable: false,
                message: 'Authorized field information.'
            })
        )
        revalidate.mockRejectedValue(new Error('revoked'))
        const response = await post({ binding, controls: {} })
        expect(response.body.code).toBe('ANALYTICS_SOURCE_CHANGED')
        expect(JSON.stringify(response.body)).not.toContain('Authorized field information')
    })
    it('does not forward malformed provider diagnostics', async () => {
        execute.mockRejectedValue({
            name: 'AnalyticsProviderError',
            diagnostic: {
                schema: 'xpert.analytics.diagnostic',
                version: 1,
                code: 'FILTER_INVALID',
                stage: 'validation',
                retryable: false,
                message: 'password=credential-secret'
            }
        })
        const response = await post({ binding, controls: {} })
        expect(response.body.code).toBe('ANALYTICS_QUERY_FAILED')
        expect(JSON.stringify(response.body)).not.toContain('credential-secret')
    })
    // Optional paired-repository acceptance: run with the built DataXpert client module path.
    ;(process.env.ANALYTICS_DATAX_CLIENT_MODULE ? it : it.skip)(
        'carries a real DataXpert client HTTP failure through runtime and ToolNode',
        async () => {
            const clientModule: {
                DataXpertAnalyticsClient: new (
                    registry: unknown
                ) => Pick<AnalyticsQueryProvider, 'execute' | 'discover'>
            } = require(process.env.ANALYTICS_DATAX_CLIENT_MODULE)
            const client = new clientModule.DataXpertAnalyticsClient({
                require: () => ({
                    createScopedApi: () => ({ getToken: async () => ({ token: 'private-viewer-token' }) })
                })
            })
            const diagnostic = {
                schema: 'xpert.analytics.diagnostic',
                version: 1,
                code: 'FILTER_OPERATOR_INVALID',
                stage: 'validation',
                retryable: false,
                message: 'Filter operator is invalid at filters.0.op. Inspect the action schema.',
                upstreamExecutionId: 'upstream-run',
                auditRef: 'audit-run'
            }
            jest.spyOn(globalThis, 'fetch').mockImplementation(
                async () =>
                    new Response(JSON.stringify(diagnostic), {
                        status: 400,
                        headers: { 'content-type': 'application/json' }
                    })
            )
            execute.mockImplementation((input, parameters, context) =>
                client.execute(
                    {
                        ...input,
                        payload: {
                            resourceId: 'r',
                            actionTypeCode: 'mdx.query_cube_slice',
                            target: { entityId: 'e' },
                            params: {}
                        }
                    },
                    parameters,
                    {
                        ...context,
                        options: {
                            baseUrl: 'https://analytics.example/api',
                            audience: 'test',
                            assistantCode: 'assistant',
                            assistantXpertId: uuid,
                            workspaceId: uuid
                        }
                    }
                )
            )
            const preview = tool(async () => runtime.query(actor, { binding, controls: {} }), {
                name: 'dashboard_preview',
                description: 'Preview',
                schema: z.object({})
            })
            const output = await new ToolNode([preview]).invoke({
                toolCall: { id: 'preview-1', name: 'dashboard_preview', args: {} }
            })
            expect(JSON.stringify(output)).toContain('FILTER_OPERATOR_INVALID')
            expect(JSON.stringify(output)).toContain('filters.0.op')
            expect(JSON.stringify(output)).toContain('audit-run')
            expect(JSON.stringify(output)).not.toContain('private-viewer-token')
        }
    )
    it.each([
        ['SANDBOX_RUNTIME_UNAVAILABLE', false, 'binding'],
        ['SANDBOX_ACTION_UNAVAILABLE', false, 'contracts'],
        ['SANDBOX_ACTION_INVALID', false, 'contracts'],
        ['SANDBOX_PROFILE_UNAVAILABLE', false, 'contracts'],
        ['SANDBOX_VERSION_MISMATCH', false, 'contracts'],
        ['SANDBOX_START_FAILED', true, 'capacity'],
        ['SANDBOX_CAPACITY_UNAVAILABLE', true, 'capacity']
    ] as const)('preserves %s with safe diagnostics at the HTTP boundary', async (code, retryable, hint) => {
        execute.mockRejectedValue(
            new SandboxJobRuntimeError(code, 'credential-secret /private/host', !retryable, 'secret-job')
        )
        const response = await post({ binding, controls: {} })
        expect(response.status).toBe(400)
        expect(response.body).toEqual({ code, retryable, stage: 'dependency', message: expect.stringContaining(hint) })
        expect(JSON.stringify(response.body)).not.toMatch(/credential-secret|private\/host|secret-job/)
    })
    it('recognizes a dependency error from another SDK instance without forwarding its properties', async () => {
        execute.mockRejectedValue({
            name: 'SandboxJobRuntimeError',
            code: 'SANDBOX_RUNTIME_UNAVAILABLE',
            message: 'credential-secret',
            retryable: false,
            jobId: 'secret-job',
            details: 'secret-details'
        })
        const response = await post({ binding, controls: {} })
        expect(response.body.code).toBe('SANDBOX_RUNTIME_UNAVAILABLE')
        expect(response.body.message).toContain('matching Runtime Suite binding')
        expect(JSON.stringify(response.body)).not.toContain('secret')
    })
    it.each([
        new BadRequestException({ code: 'SANDBOX_RUNTIME_UNAVAILABLE', message: 'credential-secret' }),
        { name: 'SandboxJobRuntimeError', code: 'SANDBOX_RUNTIME_UNAVAILABLE', message: 'credential-secret' },
        { name: 'SandboxJobRuntimeError', code: 'UNKNOWN', message: 'credential-secret', retryable: true }
    ])('keeps unrecognized errors redacted', async (error) => {
        execute.mockRejectedValue(error)
        const response = await post({ binding, controls: {} })
        expect(response.body.code).toBe('ANALYTICS_QUERY_FAILED')
        expect(JSON.stringify(response.body)).not.toContain('credential-secret')
    })
    it('reports invalid script input with fixed guidance and no runner output', async () => {
        execute.mockRejectedValue(
            new SandboxJobRuntimeError(
                'EXPORT_INPUT_INVALID',
                'ModuleNotFoundError: credential-secret /host/private',
                true,
                'private-job'
            )
        )
        const response = await post({ binding, controls: {} })
        expect(response.body).toEqual({
            code: 'EXPORT_INPUT_INVALID',
            retryable: false,
            stage: 'dependency',
            message: expect.stringContaining('standard libraries')
        })
        expect(JSON.stringify(response.body)).not.toMatch(/credential-secret|host\/private|private-job/)
    })
    it.each([
        ['read_only_violation', 'ANALYTICS_READ_ONLY_VIOLATION', 'validation', 'read-only'],
        ['MYSQL_PARAMETER_COUNT_INVALID', 'ANALYTICS_PARAMETER_ORDER_INVALID', 'validation', 'parameterOrder'],
        ['MYSQL_PARAMETER_TEMPLATE_INVALID', 'ANALYTICS_PARAMETER_TEMPLATE_INVALID', 'validation', 'quotes/comments'],
        ['ANALYTICS_FIELD_TYPE_MISMATCH', 'ANALYTICS_FIELD_TYPE_MISMATCH', 'result', 'int64'],
        ['ANALYTICS_FIELD_MISSING_OR_AMBIGUOUS', 'ANALYTICS_FIELD_MISSING_OR_AMBIGUOUS', 'result', 'sourceField'],
        ['ANALYTICS_PARAMETER_INVALID', 'ANALYTICS_PARAMETER_INVALID', 'request', 'typed scalar'],
        ['ANALYTICS_UNKNOWN_CONTROL', 'ANALYTICS_UNKNOWN_CONTROL', 'request', 'controlId']
    ])(
        'preserves actionable %s diagnostics in HTTP and Error.message for Agent tools',
        async (providerCode, code, stage, hint) => {
            execute.mockRejectedValue(new Error(providerCode))
            const response = await post({ binding, controls: {} })
            expect(response.body).toEqual({ code, stage, retryable: false, message: expect.stringContaining(hint) })
            await expect(runtime.query(actor, { binding, controls: {} })).rejects.toMatchObject({
                message: JSON.stringify(response.body)
            })
        }
    )
    it('does not treat raw provider messages as safe diagnostics even when they contain a known code', async () => {
        execute.mockRejectedValue(new Error('read_only_violation: password=credential-secret /private/host'))
        const response = await post({ binding, controls: {} })
        expect(response.body.code).toBe('ANALYTICS_QUERY_FAILED')
        await expect(runtime.query(actor, { binding, controls: {} })).rejects.not.toThrow('credential-secret')
        expect(JSON.stringify(response.body)).not.toMatch(/credential-secret|private\/host/)
    })
    it('propagates parent cancellation even if a provider ignores its signal', async () => {
        execute.mockImplementation(() => new Promise(() => undefined))
        const controller = new AbortController()
        const promise = runtime.query(
            actor,
            { binding, controls: {} },
            { signal: controller.signal, deadlineAt: Date.now() + 1000, ancestry: [] }
        )
        controller.abort()
        await expect(promise).rejects.toThrow()
    })
    it('blocks recursion and expired deadlines before source/provider execution', async () => {
        await expect(
            runtime.query(
                actor,
                { binding, controls: {} },
                { signal: new AbortController().signal, deadlineAt: Date.now() - 1, ancestry: [] }
            )
        ).rejects.toThrow()
        await expect(
            runtime.query(
                actor,
                { binding, controls: {} },
                { signal: new AbortController().signal, deadlineAt: Date.now() + 1000, ancestry: ['file.table'] }
            )
        ).rejects.toThrow()
        expect(execute).not.toHaveBeenCalled()
    })
})
