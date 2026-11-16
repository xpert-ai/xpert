import type { AnalyticsBinding, ResourceAnalysisPolicy, ResourceAnalysisQuery } from '@xpert-ai/contracts'
import {
    RequestContext,
    AnalyticsProviderError,
    type AnalyticsQueryProvider,
    type ArtifactVersionContext,
    type IArtifactTypeProvider
} from '@xpert-ai/plugin-sdk'
import { AnalyticsRuntimeService, createExecutionIdentity, runWithExecutionIdentity } from '@xpert-ai/server-core'
import { Artifact } from '../entities'
import { ArtifactUseGrant } from '../use-grants/artifact-use-grant.entity'
import { DelegatedResourceAnalysisService } from './delegated-resource-analysis.service'
import { GroupResourceAnalysisService } from './group-resource-analysis.service'
import { GroupAnalyticsBindingHandler } from './commands/handlers/group-analytics-binding.handler'
import { GroupResourceAnalysisHandler } from './commands/handlers/group-resource-analysis.handler'
import { GroupResourceAnalysisCommand } from './commands/group-resource-analysis.command'
import { GroupAnalysisDefinitionCommand } from '../../analytics/commands/group-analysis-definition.command'
import { GroupAnalyticsBindingCommand } from '../../../../server/src/analytics/commands/group-analytics-binding.command'
import { ResolveExecutionIdentityCommand } from '../../../../server/src/user/execution-identity/resolve-execution-identity.command'

jest.mock('i18next', () => ({ t: (key: string) => key }))
const viewer = { tenantId: 'tenant', organizationId: 'org', userId: 'viewer' }
const issuer = { ...viewer, userId: 'issuer' }
const id = 'a1234567-1234-4234-8234-123456789012'
const binding: AnalyticsBinding = {
    id: 'sales',
    source: { kind: 'definition', definitionId: id, versionId: id },
    providerId: 'fixture',
    operation: 'query',
    contractVersion: 1,
    payload: { query: 'server-only-query' },
    parameters: [{ name: 'region', controlId: 'region', type: 'string', required: true, defaultValue: 'east' }],
    output: {
        datasetId: 'sales',
        grain: [],
        fields: ['region', 'secret'].map((id) => ({
            id,
            sourceField: id,
            label: id,
            logicalType: 'string',
            nullable: false,
            role: 'dimension'
        }))
    }
}
const query: ResourceAnalysisQuery = {
    datasetKey: 'sales',
    controls: { region: 'west' },
    select: [],
    filters: [],
    groupBy: [],
    aggregates: [],
    orderBy: []
}
function identity(actor: typeof viewer) {
    return createExecutionIdentity(
        { id: actor.userId, tenantId: actor.tenantId, isActive: true },
        { ...actor, kind: 'user' }
    )
}

function fixture(execution: ResourceAnalysisPolicy['execution'] = 'delegated_results') {
    const policy: ResourceAnalysisPolicy = {
        execution,
        mode: 'bindings',
        allowDetails: true,
        maxRows: 1,
        datasets: [
            {
                key: 'sales',
                fields: ['region'],
                filters: [{ field: 'region', operator: 'eq', values: ['east'] }],
                ...(execution === 'delegated_results' ? { controlValues: { region: ['east', 'west'] } } : {})
            }
        ]
    }
    const artifact = Object.assign(new Artifact(), {
        id,
        ...viewer,
        projectId: 'source',
        kind: 'file',
        status: 'active'
    })
    const grant = Object.assign(new ArtifactUseGrant(), {
        id: 'grant',
        tenantId: viewer.tenantId,
        organizationId: viewer.organizationId,
        artifactId: id,
        ownerProjectId: 'source',
        issuedById: issuer.userId,
        analysis: policy,
        status: 'active',
        revision: 1,
        expiresAt: new Date(Date.now() + 60_000)
    })
    const context: ArtifactVersionContext = {
        actor: viewer,
        artifact,
        content: Buffer.from('{}'),
        version: { id, artifactId: id, versionNumber: 1, status: 'active', mimeType: 'application/json' }
    }
    const recheck = jest.fn(async () => undefined),
        sourceRecheck = jest.fn(async () => undefined)
    const resolvedSource = { source: binding.source, options: {}, providerIds: ['fixture'], revalidate: sourceRecheck }
    const resolve = jest.fn(async (_actor: typeof viewer) => resolvedSource)
    const share = jest.fn<
        ReturnType<NonNullable<AnalyticsQueryProvider['authorizeGroupSharing']>>,
        Parameters<NonNullable<AnalyticsQueryProvider['authorizeGroupSharing']>>
    >(async (_binding, context) => {
        expect(context.actor).toEqual(issuer)
        expect(RequestContext.currentUserId()).toBe(issuer.userId)
    })
    const execute = jest.fn<
        ReturnType<AnalyticsQueryProvider['execute']>,
        Parameters<AnalyticsQueryProvider['execute']>
    >(async (_binding, _parameters, context) => {
        expect(RequestContext.currentUserId()).toBe(context.actor.userId)
        return {
            columns: [{ key: 'region' }, { key: 'secret' }],
            rows: [
                { region: 'east', secret: 'private' },
                { region: 'west', secret: 'private' }
            ],
            completeness: { returnedRows: 2, totalAccuracy: 'exact', scope: 'full_query_result', truncated: false },
            sourceFetchedAt: new Date().toISOString()
        }
    })
    const provider: AnalyticsQueryProvider = {
        descriptor: {
            id: 'fixture',
            name: 'Fixture',
            sourceKinds: ['definition'],
            operations: [{ name: 'query', contractVersion: 1, readOnly: true }]
        },
        execute,
        authorizeGroupSharing: share
    }
    let bindingHandler: GroupAnalyticsBindingHandler
    const runtime = new AnalyticsRuntimeService(
        { list: () => [provider] } as never,
        [{ kind: 'definition', list: async () => [], resolve }],
        { execute: (command: GroupAnalyticsBindingCommand) => bindingHandler.execute(command) } as never
    )
    const restore = jest.fn(async (command: ResolveExecutionIdentityCommand) => {
        expect(command.actor).toEqual({ ...issuer, kind: 'user' })
        return identity(issuer)
    })
    const delegation = new DelegatedResourceAnalysisService(
        { execute: restore } as never,
        { assert: async () => undefined } as never,
        runtime
    )
    const native: IArtifactTypeProvider = {
        definition: { kinds: ['file'], presentation: { mode: 'authenticated' } },
        authorize: async () => undefined,
        validateContent: () => undefined,
        analytics: { resolveBindings: async () => [{ binding }] }
    }
    const analysis = new GroupResourceAnalysisService(
        {
            load: async () => ({ selected: { grant, artifact, reference: { title: 'Report' } }, context, recheck })
        } as never,
        { provider: () => native } as never,
        runtime,
        delegation
    )
    const definition = jest.fn(async (command: GroupAnalysisDefinitionCommand) => {
        expect(RequestContext.currentUserId()).toBe(command.actor.userId)
        expect(command.approvedById).toBe(issuer.userId)
        return resolvedSource
    })
    bindingHandler = new GroupAnalyticsBindingHandler(analysis, { execute: definition } as never)
    return { analysis, grant, execute, share, restore, definition, recheck, sourceRecheck }
}

it.each(['delegated_results', 'viewer_permissions', undefined] as const)(
    'runs the real group query chain with %s identity and projects only approved results',
    async (execution) => {
        const f = fixture(execution)
        // Explicit undefined must test legacy semantics rather than the fixture's default parameter.
        if (execution === undefined) {
            delete f.grant.analysis.execution
            delete f.grant.analysis.datasets[0].controlValues
        }
        await runWithExecutionIdentity(identity(viewer), async () => {
            const result = await f.analysis.queryAnalysis(viewer, 'group', 'reference', query)
            expect(result.dataset.rows).toEqual([{ region: 'east' }])
            expect(result.dataset.fields.map((field) => field.id)).toEqual(['region'])
            expect(JSON.stringify(result)).not.toMatch(/private|server-only-query/)
            expect(RequestContext.currentUserId()).toBe(viewer.userId)
        })
        const actor = execution === 'delegated_results' ? issuer : viewer
        expect(f.execute).toHaveBeenCalledWith(binding, { region: 'west' }, expect.objectContaining({ actor }))
        expect(f.definition).toHaveBeenCalledWith(expect.objectContaining({ actor }))
        expect(f.restore).toHaveBeenCalledTimes(execution === 'delegated_results' ? 2 : 0)
    }
)

it('rejects undelegated controls before running a provider query', async () => {
    const f = fixture()
    await runWithExecutionIdentity(identity(viewer), async () => {
        await expect(
            f.analysis.queryAnalysis(viewer, 'group', 'reference', { ...query, controls: { region: 'secret' } })
        ).rejects.toThrow()
    })
    expect(f.execute).not.toHaveBeenCalled()
})

it.each(['source', 'grant'] as const)(
    'withholds queried rows after %s revocation and restores the viewer',
    async (kind) => {
        const f = fixture(),
            execute = f.execute.getMockImplementation()!
        f.execute.mockImplementationOnce(async (...args) => {
            const result = await execute(...args)
            if (kind === 'source') f.share.mockRejectedValue(new Error('revoked'))
            else f.recheck.mockRejectedValue(new Error('revoked'))
            return result
        })
        await runWithExecutionIdentity(identity(viewer), async () => {
            await expect(f.analysis.queryAnalysis(viewer, 'group', 'reference', query)).rejects.toThrow()
            expect(RequestContext.currentUserId()).toBe(viewer.userId)
        })
    }
)

it.each(['untyped', 'diagnostic'])(
    'redacts %s source failures when delivering earlier successful evidence',
    async (kind) => {
        const f = fixture()
        const row = {
            actorId: viewer.userId,
            assistantId: 'assistant',
            referenceId: 'reference',
            grantId: 'grant',
            grantRevision: 1,
            datasetKey: 'sales'
        }
        const handler = new GroupResourceAnalysisHandler(
            { getRepository: () => ({ findBy: async () => [row] }) } as never,
            { resolve: async () => ({ grant: f.grant }) } as never,
            f.analysis
        )
        await runWithExecutionIdentity(identity(viewer), async () => {
            await f.analysis.queryAnalysis(viewer, 'group', 'reference', query)
            f.share.mockRejectedValue(
                kind === 'untyped'
                    ? new Error('revoked before delivery')
                    : new AnalyticsProviderError({
                          schema: 'xpert.analytics.diagnostic',
                          version: 1,
                          code: 'QUERY_FILTER_INVALID',
                          stage: 'validation',
                          retryable: false,
                          message: 'Field private_cost_center is unavailable.'
                      })
            )
            await expect(
                handler.execute(
                    new GroupResourceAnalysisCommand(viewer, 'group', 'assistant', 'execution', {
                        kind: 'validate-delivery'
                    })
                )
            ).rejects.toThrow('ResourceAnalysisSourceDenied')
            expect(f.share).toHaveBeenCalledTimes(3)
            expect(RequestContext.currentUserId()).toBe(viewer.userId)
        })
    }
)
