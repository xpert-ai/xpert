import { ApplicationInitializationLocks } from '../application/application-initialization-locks'
import { ApplicationModelReaderService } from './application-model-reader.service'
import type { INestApplication } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import { getRepositoryToken } from '@nestjs/typeorm'
import { AnalyticsProviderRegistry, RequestContext } from '@xpert-ai/plugin-sdk'
import { Integration } from '@xpert-ai/server-core'
import { AnalyticsDefinitionService } from '../../analytics/analytics-definition.service'
import { ApplicationAccessService } from '../application/application-access.service'
import { PluginApplicationService } from '../application/plugin-application.service'
import { OrganizationSettingsService } from './organization-settings.service'
import { ApplicationModelSetupController } from './application-model-setup.controller'
import { ApplicationModelSetupService } from './application-model-setup.service'

describe('organization application model setup over HTTP', () => {
    const connection = '11111111-1111-4111-8111-111111111111'
    const definitionId = '22222222-2222-4222-8222-222222222222'
    const versionId = '33333333-3333-4333-8333-333333333333'
    const actor = { tenantId: 'tenant', organizationId: 'org', userId: '44444444-4444-4444-8444-444444444444' }
    const target = { pluginName: 'example-plugin', appName: 'orders', installationScope: 'organization' }
    const providerId = 'example.analytics'
    const keys = ['cost', 'quantities', 'recheck']
    const fields = keys.map((key) => ({ kind: 'analytics', key, providerId, requiredNumericFields: ['value'] }))
    const recipes = Object.fromEntries(keys.map((key) => [key, { businessRule: key }]))
    const bundle = {
        key: 'demo',
        version: '2',
        modes: [{ id: 'demo', label: { en_US: 'Demo' } }],
        bundle: { format: 'test' }
    }
    const inspected = jest.fn(async () => ({
        state: 'create',
        modelLabel: 'Demo',
        fingerprint: 'verified',
        differences: []
    }))
    const apply = jest.fn(async () => ({ id: 'published', label: 'Demo' }))
    const getDefinition = () => ({
        scope: 'organization',
        config: {
            organizationSetup: fields,
            analyticsSetup: { kind: 'connection-model', providerId, recipes, bootstrap: bundle }
        }
    })
    const ensure = jest.fn().mockResolvedValue({ definition: { id: definitionId }, version: { id: versionId } })
    let value = 10
    const preview = jest.fn(async () => ({
        options: { connection, resourceId: 'm' },
        modelLabel: 'Model',
        queries: keys.map((key) => ({
            key,
            rowCount: 1,
            sample: [{ value }],
            binding: {
                id: key,
                providerId,
                operation: 'action',
                contractVersion: 1,
                parameters: [],
                payload: { business: key },
                output: {
                    datasetId: key,
                    grain: [],
                    fields: [
                        {
                            id: 'value',
                            sourceField: 'amount',
                            label: 'Amount',
                            logicalType: 'float64',
                            nullable: false,
                            role: 'measure'
                        }
                    ]
                }
            }
        }))
    }))
    const modelSetup = {
        bootstrap: { inspect: inspected, apply },
        integrationProvider: 'example',
        models: jest.fn(async () => [{ id: 'm', label: 'Model' }]),
        preview
    }
    let app: INestApplication
    let url: string
    beforeAll(async () => {
        jest.spyOn(RequestContext, 'hasPermission').mockReturnValue(true)
        const module = await Test.createTestingModule({
            controllers: [ApplicationModelSetupController],
            providers: [
                ApplicationModelSetupService,
                {
                    provide: ApplicationInitializationLocks,
                    useValue: { run: (_key: string, fn: () => Promise<unknown>) => fn() }
                },
                { provide: ApplicationModelReaderService, useValue: { authorize: jest.fn(), scoped: jest.fn() } },
                { provide: PluginApplicationService, useValue: { getDefinition } },
                { provide: ApplicationAccessService, useValue: { assertCanInitialize: jest.fn() } },
                {
                    provide: AnalyticsDefinitionService,
                    useValue: { authorize: async () => actor, ensureOrganizationDefinition: ensure }
                },
                {
                    provide: OrganizationSettingsService,
                    useValue: {
                        form: async () => ({ settings: { revision: 7 }, users: [{ id: actor.userId, label: 'Admin' }] })
                    }
                },
                {
                    provide: AnalyticsProviderRegistry,
                    useValue: { list: () => [{ descriptor: { id: providerId }, modelSetup }] }
                },
                {
                    provide: getRepositoryToken(Integration),
                    useValue: {
                        findOne: async () => ({
                            id: connection,
                            tenantId: 'tenant',
                            organizationId: 'org',
                            options: {}
                        }),
                        find: async () => [
                            { id: connection, tenantId: 'tenant', organizationId: 'org', name: 'Org' },
                            {
                                id: versionId,
                                tenantId: 'tenant',
                                organizationId: null,
                                name: 'Unshared',
                                sharing: { visibility: 'all-organizations', usages: [] }
                            }
                        ]
                    }
                }
            ]
        }).compile()
        app = module.createNestApplication({ logger: false })
        await app.listen(0, '127.0.0.1')
        url = (await app.getUrl()) + '/plugin-applications/organization-settings/model'
    })
    afterAll(async () => {
        await app?.close()
        jest.restoreAllMocks()
    })
    const post = (operation: unknown) =>
        fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(Object.assign({}, target, operation))
        })
    const model = { integrationId: connection, modelId: 'm', revision: 7 }
    it('lists authorized choices, previews all fields without writing and pins one version on confirmation', async () => {
        expect(await (await post({ step: 'connections' })).json()).toEqual({
            choices: [{ id: connection, label: 'Org' }]
        })
        expect((await post({ step: 'models', integrationId: versionId })).status).toBe(400)
        expect(await (await post({ step: 'models', integrationId: connection })).json()).toEqual({
            choices: [{ id: 'm', label: 'Model' }]
        })
        const result = await (await post({ step: 'preview', ...model })).json()
        expect(result.queries.map((q) => q.key)).toEqual(keys)
        expect(result.options).toBeUndefined()
        expect(ensure).not.toHaveBeenCalled()
        value = 11
        expect((await post({ step: 'confirm', ...model, receipt: result.receipt })).status).toBe(409)
        expect(ensure).not.toHaveBeenCalled()
        const fresh = await (await post({ step: 'preview', ...model })).json()
        const saved = await (await post({ step: 'confirm', ...model, receipt: fresh.receipt })).json()
        for (const key of keys)
            expect(saved.queries[key].source).toEqual({ kind: 'definition', definitionId, versionId })
        expect(ensure).toHaveBeenCalledTimes(1)
    })
    it('requires the reviewed bundle, current actor, same revision and unchanged target before provisioning', async () => {
        const selected = {
            integrationId: connection,
            workspaceId: versionId,
            dataSourceId: definitionId,
            userIds: [actor.userId],
            mode: 'demo',
            revision: 7
        }
        expect((await post({ ...selected, step: 'bootstrap-plan', draft: {} })).status).toBe(400)
        expect((await post({ ...selected, step: 'bootstrap-plan', userIds: [versionId] })).status).toBe(400)
        const { plan } = await (await post({ ...selected, step: 'bootstrap-plan' })).json()
        expect(plan.state).toBe('create')
        expect(apply).not.toHaveBeenCalled()
        expect(
            (await post({ ...selected, step: 'bootstrap-apply', workspaceId: definitionId, receipt: plan.receipt }))
                .status
        ).toBe(409)
        inspected.mockResolvedValueOnce({
            state: 'conflict',
            modelLabel: 'Demo',
            fingerprint: 'changed',
            differences: []
        })
        expect((await post({ ...selected, step: 'bootstrap-apply', receipt: plan.receipt })).status).toBe(409)
        expect(apply).not.toHaveBeenCalled()
        expect(await (await post({ ...selected, step: 'bootstrap-apply', receipt: plan.receipt })).json()).toEqual({
            model: { id: 'published', label: 'Demo' }
        })
        expect(apply).toHaveBeenCalledTimes(1)
    })
    it('rejects injected scope, custom recipes, missing receipt and stale revisions', async () => {
        for (const extra of [{ organizationId: 'another' }, { recipes }, { step: 'confirm' }]) {
            expect((await post({ step: 'preview', ...model, ...extra })).status).toBe(400)
        }
        expect((await post({ step: 'preview', ...model, revision: 6 })).status).toBe(409)
    })
})
