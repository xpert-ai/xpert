import { Test, TestingModule } from '@nestjs/testing'
import type {
    AnalyticsBinding,
    AnalyticalDataset,
    ResourceAnalysisPolicy,
    ResourceAnalysisQuery
} from '@xpert-ai/contracts'
import { artifactTypeKey, type ArtifactVersionContext, type IArtifactTypeProvider } from '@xpert-ai/plugin-sdk'
import { AnalyticsRuntimeService } from '@xpert-ai/server-core'
import { ArtifactGroupContentService } from '../group-references/artifact-group-content.service'
import { ArtifactTypesService } from '../types/artifact-types.service'
import { configuredArtifactPolicies } from '../testing/source-policies'
import { ArtifactContentAccess } from '../artifact-content-access'
import { ArtifactsService } from '../artifacts.service'
import { GroupResourceAnalysisService } from './group-resource-analysis.service'
import { ResourceAnalysisAuthoringHandler } from './commands/handlers/resource-analysis-authoring.handler'
import { ResourceAnalysisAuthoringCommand } from './commands/resource-analysis-authoring.command'
import { resolveArtifactAnalytics } from './artifact-analytics'

jest.mock('i18next', () => ({ t: (key: string) => key }))
const id = 'a1234567-1234-4234-8234-123456789012'
const actor = { tenantId: 'tenant', organizationId: 'org', userId: 'reader' }
const type = { pluginName: '@example/analytics-report', resourceType: 'report' }
const field = {
    id: 'plant',
    sourceField: 'private_native_column',
    label: 'Plant',
    logicalType: 'string' as const,
    nullable: false,
    role: 'dimension' as const
}
const binding: AnalyticsBinding = {
    id: 'stock',
    source: { kind: 'definition', definitionId: id, versionId: id },
    providerId: 'fixture',
    operation: 'query',
    contractVersion: 1,
    payload: { native: 'private query' },
    parameters: [],
    output: { datasetId: 'inventory', fields: [field], grain: [] }
}
const context: ArtifactVersionContext = {
    actor,
    content: Buffer.from('published bytes'),
    artifact: {
        ...actor,
        ...type,
        id,
        resourceId: 'report-1',
        kind: 'file',
        status: 'active',
        projectId: 'source',
        typeBinding: { ...type, scopeKey: actor.organizationId }
    },
    version: { id, artifactId: id, versionNumber: 3, status: 'active', mimeType: 'application/json' }
}
const policy: ResourceAnalysisPolicy = {
    mode: 'explore',
    datasets: [{ key: 'stock', fields: ['plant'], filters: [] }],
    allowDetails: true,
    maxRows: 20
}
const query: ResourceAnalysisQuery = {
    datasetKey: 'stock',
    controls: {},
    select: [],
    filters: [],
    groupBy: [],
    aggregates: [],
    orderBy: [],
    limit: 20
}
const dataset: AnalyticalDataset = {
    schema: 'xpert.analytics.dataset',
    datasetId: 'inventory',
    fields: [field],
    rows: [{ plant: 'A' }],
    grain: [],
    completeness: { returnedRows: 1, totalAccuracy: 'exact', scope: 'full_query_result', truncated: false },
    freshness: { executedAt: '2026-11-08T00:00:00Z', sourceFetchedAt: '2026-11-08T00:00:00Z' },
    provenance: { executionId: id, bindingId: 'stock', providerId: 'fixture' }
}

describe('Artifact Type analytics composition without a Presentation registry', () => {
    let module: TestingModule,
        types: ArtifactTypesService,
        analysis: GroupResourceAnalysisService,
        authoring: ResourceAnalysisAuthoringHandler
    const resolveBindings = jest.fn(),
        normalizeControls = jest.fn(),
        queryGroupReference = jest.fn(),
        authorizeGroupSharing = jest.fn()
    const recheck = jest.fn(),
        assertAccess = jest.fn()
    let provider: IArtifactTypeProvider
    beforeEach(async () => {
        resolveBindings.mockReset().mockResolvedValue([{ binding }])
        normalizeControls.mockReset().mockImplementation((_context, _key, controls) => controls)
        queryGroupReference.mockReset().mockResolvedValue(dataset)
        authorizeGroupSharing.mockReset().mockResolvedValue(undefined)
        recheck.mockReset().mockResolvedValue(undefined)
        assertAccess.mockReset().mockResolvedValue(undefined)
        provider = {
            definition: { kinds: ['file'], presentation: { mode: 'authenticated' } },
            authorize: async () => {},
            validateContent: () => {},
            analytics: { resolveBindings, normalizeControls }
        }
        types = configuredArtifactPolicies()
        types.registry.register(artifactTypeKey(type), provider, {
            kind: 'plugin',
            pluginName: type.pluginName,
            scopeKey: actor.organizationId
        })
        module = await Test.createTestingModule({
            providers: [
                GroupResourceAnalysisService,
                ResourceAnalysisAuthoringHandler,
                { provide: ArtifactTypesService, useValue: types },
                {
                    provide: ArtifactGroupContentService,
                    useValue: {
                        load: async () => ({
                            context,
                            recheck,
                            selected: {
                                grant: { analysis: policy, issuedById: 'author' },
                                reference: { title: 'Report' }
                            }
                        })
                    }
                },
                { provide: AnalyticsRuntimeService, useValue: { queryGroupReference, authorizeGroupSharing } },
                {
                    provide: ArtifactsService,
                    useValue: { resolveForManagementAccess: async () => ({ ...context, buffer: context.content }) }
                },
                { provide: ArtifactContentAccess, useValue: { assert: assertAccess } }
            ]
        }).compile()
        analysis = module.get(GroupResourceAnalysisService)
        authoring = module.get(ResourceAnalysisAuthoringHandler)
    })
    afterEach(async () => module?.close())

    it('describes and executes a fixed dataset without registering any renderer', async () => {
        const description = await analysis.describeAnalysis(actor, 'group', 'reference')
        expect(description.datasets[0]).toMatchObject({ key: 'stock', title: 'inventory', fields: [field] })
        expect(JSON.stringify(description)).not.toContain('private query')
        expect(description.versionNumber).toBe(3)
        const result = await analysis.queryAnalysis(actor, 'group', 'reference', query)
        expect(result.dataset.rows).toEqual([{ plant: 'A' }])
        expect(queryGroupReference).toHaveBeenCalledWith(
            actor,
            { groupId: 'group', referenceId: 'reference', datasetKey: 'stock' },
            {}
        )
        expect(resolveBindings).toHaveBeenCalledWith(context)
    })
    it('does not execute ungranted datasets or fields', async () => {
        await expect(
            analysis.queryAnalysis(actor, 'group', 'reference', { ...query, datasetKey: 'other' })
        ).rejects.toThrow()
        await expect(
            analysis.queryAnalysis(actor, 'group', 'reference', { ...query, select: ['secret'] })
        ).rejects.toThrow()
        expect(queryGroupReference).not.toHaveBeenCalled()
    })
    it('pins the analytics registration throughout parameter normalization and execution', async () => {
        const selected = await analysis.resolveAnalysisBinding(actor, 'group', 'reference', 'stock')
        await selected.normalizeControls({})
        expect(normalizeControls).toHaveBeenCalledWith(context, 'stock', {})
        types.registry.remove(actor.organizationId, type.pluginName)
        await expect(selected.normalizeControls({})).rejects.toThrow()
        await expect(selected.revalidate()).rejects.toThrow()
    })
    it('withholds completed results after revocation or type removal', async () => {
        queryGroupReference.mockImplementationOnce(async () => {
            recheck.mockRejectedValue(new Error('revoked'))
            return dataset
        })
        await expect(analysis.queryAnalysis(actor, 'group', 'reference', query)).rejects.toThrow('revoked')
        recheck.mockResolvedValue(undefined)
        queryGroupReference.mockImplementationOnce(async () => {
            types.registry.remove(actor.organizationId, type.pluginName)
            return dataset
        })
        await expect(analysis.queryAnalysis(actor, 'group', 'reference', query)).rejects.toThrow()
    })
    it('rejects duplicate keys and malformed plugin declarations before source execution', async () => {
        for (const entries of [
            [{ binding }, { binding }],
            [{ binding: { ...binding, source: { kind: 'untrusted' } } }]
        ]) {
            resolveBindings.mockResolvedValueOnce(entries)
            await expect(analysis.queryAnalysis(actor, 'group', 'reference', query)).rejects.toThrow(
                'ResourceAnalysisInvalid'
            )
        }
        expect(queryGroupReference).not.toHaveBeenCalled()
    })
    it('fails closed when a type has no analytics extension', async () => {
        types.registry.remove(actor.organizationId, type.pluginName)
        types.registry.register(
            artifactTypeKey(type),
            { definition: provider.definition, authorize: async () => {}, validateContent: () => {} },
            { kind: 'plugin', pluginName: type.pluginName, scopeKey: actor.organizationId }
        )
        await expect(resolveArtifactAnalytics(types, context)).rejects.toThrow('ResourceAnalysisUnsupported')
    })
    it('checks source-sharing authority through Analytics as the current authoring actor', async () => {
        const result = await authoring.execute(new ResourceAnalysisAuthoringCommand(actor, id, id))
        expect(result[0].canShare).toBe(true)
        expect(authorizeGroupSharing).toHaveBeenCalledWith(actor, binding)
        expect(queryGroupReference).not.toHaveBeenCalled()
        expect(assertAccess).toHaveBeenCalledTimes(2)
        authorizeGroupSharing.mockRejectedValue(new Error('no delegation authority'))
        expect((await authoring.execute(new ResourceAnalysisAuthoringCommand(actor, id, id)))[0].canShare).toBe(false)
        await expect(authoring.execute(new ResourceAnalysisAuthoringCommand(actor, id, id, policy))).rejects.toThrow()
    })
    it('rejects a provider replaced while authoring authority was checked', async () => {
        authorizeGroupSharing.mockImplementationOnce(async () =>
            types.registry.remove(actor.organizationId, type.pluginName)
        )
        await expect(authoring.execute(new ResourceAnalysisAuthoringCommand(actor, id, id, policy))).rejects.toThrow()
    })
})
