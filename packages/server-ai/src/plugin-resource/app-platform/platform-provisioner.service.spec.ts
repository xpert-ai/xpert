import { Logger } from '@nestjs/common'
import { Test, TestingModule } from '@nestjs/testing'
import { QueryBus } from '@nestjs/cqrs'
import { DataSource } from 'typeorm'
import { AiModelTypeEnum, UserType } from '@xpert-ai/contracts'
import { RequestContext } from '@xpert-ai/plugin-sdk'
import { User } from '@xpert-ai/server-core'
import { PlatformProvisionerService } from './platform-provisioner.service'
import { PlatformMaintenanceActorService } from './platform-maintenance-actor.service'
import { PlatformModels, PlatformModelsService } from './platform-models.service'
import { AppPlatformDelivery } from './app-platform-delivery.entity'
import { PlatformResourceBinding } from './platform-resource-binding.entity'
import { platformConfigurationSnapshotSchema } from './platform-configuration-snapshot'
import { PlatformStorageUsageService } from './storage/platform-storage-usage.service'
import { PluginApplicationService } from '../application/plugin-application.service'
import { ApplicationInitializationLocks } from '../application/application-initialization-locks'
import { PluginApplicationInstallation } from '../plugin-application-installation.entity'
import { AssistantSharingService } from '../../xpert/sharing/sharing.service'
import { MembershipService } from '../../membership/membership.service'
import { Knowledgebase } from '../../knowledgebase/persistence/knowledgebase.entity'
import { currentServiceOperation } from '../../shared/service-operation'

const id = (value: number) => `00000000-0000-4000-8000-${String(value).padStart(12, '0')}`

function delivery() {
    const configuration = platformConfigurationSnapshotSchema.parse({
        digest: 'a'.repeat(64),
        definition: {
            schemaVersion: 1,
            key: 'platform',
            version: 1,
            branding: { name: 'Test' },
            registration: { role: 'APP_USER', organization: 'per-account' },
            apps: [
                {
                    key: 'main',
                    required: true,
                    configurationRef: 'default',
                    appRef: { pluginName: 'plugin', appName: 'app' }
                }
            ],
            experience: { home: 'main', navigation: ['main'] },
            entitlements: { defaultPlanRef: 'trial' }
        },
        environment: {
            schemaVersion: 1,
            configurations: { default: { primary: { provider: 'provider', model: 'model' } } },
            plans: {
                trial: { trialDays: 7, creditLimit: 100, maxProjects: 10, maxUploadBytes: 1000, maxConcurrentRuns: 2 }
            }
        }
    })
    return Object.assign(new AppPlatformDelivery(), {
        id: id(1),
        tenantId: id(2),
        organizationId: id(3),
        userId: id(4),
        configuration,
        configurationDigest: configuration.digest,
        apps: [{ key: 'main', status: 'pending', attempts: 0 }]
    })
}

describe('managed App provisioning', () => {
    let module: TestingModule
    let service: PlatformProvisionerService
    let row: AppPlatformDelivery
    let installation: PluginApplicationInstallation
    let selected: PlatformModels
    const deliveries = { findOneByOrFail: jest.fn(), save: jest.fn() }
    const installations = { findOneByOrFail: jest.fn() }
    const knowledgebases = { findOneBy: jest.fn() }
    const bindings = { upsert: jest.fn() }
    const runner = {
        connect: jest.fn(),
        startTransaction: jest.fn(),
        query: jest.fn(),
        commitTransaction: jest.fn(),
        rollbackTransaction: jest.fn(),
        release: jest.fn(),
        isTransactionActive: true
    }
    const actors = { beneficiary: jest.fn(), ensure: jest.fn() }
    const models = { resolve: jest.fn(), toolSources: jest.fn() }
    const applications = {
        getDetail: jest.fn(),
        getDefinition: jest.fn(),
        initialize: jest.fn(),
        updateApplication: jest.fn()
    }
    const memberships = {
        ensureTenantDefaultMembership: jest.fn(),
        findModelAccess: jest.fn(),
        isModelAllowed: jest.fn()
    }
    const sharing = { grantUsers: jest.fn() }
    const storage = { refresh: jest.fn() }
    const queries = { execute: jest.fn() }
    const locks = { run: jest.fn() }

    beforeEach(async () => {
        jest.resetAllMocks()
        jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined)
        row = delivery()
        installation = Object.assign(new PluginApplicationInstallation(), {
            id: id(10),
            tenantId: row.tenantId,
            organizationId: row.organizationId,
            status: 'ready',
            resourceRefs: {
                assistant: id(11),
                'role:external': id(12),
                'role:standalone': id(13),
                'knowledgebase:library': id(14)
            }
        })
        const actor = Object.assign(new User(), { id: id(5), tenantId: row.tenantId, type: UserType.COMMUNICATION })
        selected = {
            primary: { copilotId: id(6), model: 'model', modelType: AiModelTypeEnum.LLM },
            auxiliary: [],
            billingModels: [{ copilotId: id(6), provider: 'provider', model: 'model', modelType: AiModelTypeEnum.LLM }]
        }
        deliveries.findOneByOrFail.mockResolvedValue(row)
        installations.findOneByOrFail.mockResolvedValue(installation)
        actors.ensure.mockResolvedValue(actor)
        models.resolve.mockResolvedValue(selected)
        models.toolSources.mockResolvedValue([id(20)])
        memberships.ensureTenantDefaultMembership.mockResolvedValue({ id: 'membership' })
        memberships.findModelAccess.mockResolvedValue({ membership: { plan: {} } })
        memberships.isModelAllowed.mockReturnValue(true)
        applications.getDetail.mockResolvedValue({
            application: { config: {} },
            preflight: { toolsetRequirements: [] }
        })
        queries.execute.mockResolvedValue([
            {
                id: id(6),
                providerWithModels: {
                    provider: 'provider',
                    models: [{ model: 'model', model_type: AiModelTypeEnum.LLM }]
                }
            }
        ])
        locks.run.mockImplementation(async (_key, action: () => Promise<void>) => action())
        module = await Test.createTestingModule({
            providers: [
                PlatformProvisionerService,
                {
                    provide: DataSource,
                    useValue: {
                        getRepository: (entity: object) => {
                            if (entity === AppPlatformDelivery) return deliveries
                            if (entity === PluginApplicationInstallation) return installations
                            if (entity === Knowledgebase) return knowledgebases
                            if (entity === PlatformResourceBinding) return bindings
                            throw new Error('Unexpected repository')
                        },
                        manager: { connection: { createQueryRunner: () => runner } }
                    }
                },
                { provide: PlatformMaintenanceActorService, useValue: actors },
                { provide: PlatformModelsService, useValue: models },
                { provide: PluginApplicationService, useValue: applications },
                { provide: AssistantSharingService, useValue: sharing },
                { provide: MembershipService, useValue: memberships },
                { provide: ApplicationInitializationLocks, useValue: locks },
                { provide: QueryBus, useValue: queries },
                { provide: PlatformStorageUsageService, useValue: storage }
            ]
        }).compile()
        service = module.get(PlatformProvisionerService)
    })

    afterEach(async () => {
        await module.close()
        jest.restoreAllMocks()
    })

    const provision = () => service.provision(row.id, row.configurationDigest)

    it('reuses the App lifecycle with scoped maintenance identity and grants the entire Assistant suite', async () => {
        applications.initialize.mockImplementation(async () => {
            expect(RequestContext.currentUserId()).toBe(id(5))
            expect(RequestContext.currentTenantId()).toBe(row.tenantId)
            expect(RequestContext.getOrganizationId()).toBe(row.organizationId)
            expect(currentServiceOperation()).toEqual({
                tenantId: row.tenantId,
                organizationId: row.organizationId,
                actorId: id(5),
                subjectId: row.userId,
                application: { pluginName: 'plugin', appName: 'app' }
            })
        })
        storage.refresh.mockImplementation(async () => expect(row.readyAt).toBeUndefined())
        await provision()
        expect(locks.run).toHaveBeenCalledWith(`platform:${row.id}`, expect.any(Function))
        expect(applications.initialize).toHaveBeenCalledWith(
            expect.objectContaining({
                pluginName: 'plugin',
                appName: 'app',
                installationScope: 'organization',
                operationId: `platform-${row.id}-main`
            }),
            expect.objectContaining({ primaryModel: selected.primary })
        )
        expect(installations.findOneByOrFail).toHaveBeenCalledWith({
            tenantId: row.tenantId,
            organizationId: row.organizationId,
            pluginName: 'plugin',
            appName: 'app',
            scopeKey: row.organizationId
        })
        expect(sharing.grantUsers.mock.calls).toEqual([
            [id(11), [row.userId]],
            [id(12), [row.userId]],
            [id(13), [row.userId]]
        ])
        expect(row.apps[0]).toMatchObject({
            status: 'ready',
            attempts: 1,
            installationId: installation.id,
            appliedDigest: row.configurationDigest
        })
        expect(row.readyAt).toBeInstanceOf(Date)
        expect(currentServiceOperation()).toBeNull()
    })

    it('ignores a stale release job before account or application changes', async () => {
        await service.provision(row.id, 'b'.repeat(64))
        expect(actors.beneficiary).not.toHaveBeenCalled()
        expect(deliveries.save).not.toHaveBeenCalled()
        expect(applications.initialize).not.toHaveBeenCalled()
    })

    it('stops before provisioning when the beneficiary is no longer authorized', async () => {
        actors.beneficiary.mockRejectedValue(new Error('Account unavailable'))
        await expect(provision()).rejects.toThrow('Account unavailable')
        expect(actors.ensure).not.toHaveBeenCalled()
        expect(applications.initialize).not.toHaveBeenCalled()
    })

    it('requires an available membership before creating the maintenance actor', async () => {
        memberships.ensureTenantDefaultMembership.mockResolvedValue(null)
        await expect(provision()).rejects.toThrow('application_trial_unavailable')
        expect(actors.ensure).not.toHaveBeenCalled()
        expect(applications.initialize).not.toHaveBeenCalled()
    })

    it.each(['membership', 'model-policy', 'catalog', 'required-model', 'tool'])(
        'fails before installation when %s is unavailable',
        async (missing) => {
            if (missing === 'membership') memberships.findModelAccess.mockResolvedValue(null)
            if (missing === 'model-policy') memberships.isModelAllowed.mockReturnValue(false)
            if (missing === 'catalog') queries.execute.mockResolvedValue([])
            if (missing === 'required-model')
                applications.getDetail.mockResolvedValue({
                    application: { config: { modelRequirements: { embedding: true } } },
                    preflight: { toolsetRequirements: [] }
                })
            if (missing === 'tool')
                applications.getDetail.mockResolvedValue({
                    application: { config: {} },
                    preflight: { toolsetRequirements: [{ key: 'search', options: [] }] }
                })
            await expect(provision()).rejects.toThrow('application_preparation_incomplete')
            expect(row.apps[0].status).toBe('failed')
            expect(applications.initialize).not.toHaveBeenCalled()
            expect(sharing.grantUsers).not.toHaveBeenCalled()
            expect(storage.refresh).not.toHaveBeenCalled()
        }
    )

    it('records bounded failure codes and retries the same installation operation', async () => {
        applications.initialize.mockRejectedValueOnce(new Error('credential=private-value'))
        await expect(provision()).rejects.toThrow('application_preparation_incomplete')
        expect(row.apps[0]).toMatchObject({
            status: 'failed',
            attempts: 1,
            errorCode: 'application_preparation_failed'
        })
        expect(row.readyAt).toBeUndefined()
        expect(JSON.stringify(row)).not.toContain('private-value')
        await provision()
        expect(row.apps[0]).toMatchObject({ status: 'ready', attempts: 2 })
        expect(row.apps[0].errorCode).toBeUndefined()
        expect(applications.initialize.mock.calls[0][0].operationId).toBe(
            applications.initialize.mock.calls[1][0].operationId
        )
    })

    it('blocks dependent Apps while allowing independent Apps to finish', async () => {
        const base = row.configuration.definition.apps[0]
        row.configuration.definition.apps.push(
            { ...base, key: 'dependent', dependsOn: ['main'] },
            { ...base, key: 'independent', dependsOn: [] }
        )
        row.apps.push(
            { key: 'dependent', status: 'pending', attempts: 0 },
            { key: 'independent', status: 'pending', attempts: 0 }
        )
        models.resolve.mockRejectedValueOnce(new Error('Unavailable'))
        await expect(provision()).rejects.toThrow('application_preparation_incomplete')
        expect(row.apps.map((state) => state.status)).toEqual(['failed', 'blocked', 'ready'])
        expect(row.apps[1].errorCode).toBe('application_dependency_not_ready')
        expect(applications.initialize).toHaveBeenCalledTimes(1)
    })

    it.each([false, true])(
        'resumes the durable upgrade when its operation is already installed: %s',
        async (resume) => {
            row.apps[0].installationId = installation.id
            row.apps[0].updateOperationId = id(30)
            if (resume) installation.updateRelease = { operationId: id(30) }
            await provision()
            expect(applications.initialize).not.toHaveBeenCalled()
            expect(applications.updateApplication).toHaveBeenCalledWith(
                {
                    pluginName: 'plugin',
                    appName: 'app',
                    installationScope: 'organization',
                    operationId: id(30),
                    resume
                },
                expect.any(Object)
            )
            expect(row.apps[0].installationId).toBe(installation.id)
            expect(row.apps[0].updateOperationId).toBeUndefined()
        }
    )

    it('does not grant access when the installation has not reached ready', async () => {
        installation.status = 'initializing'
        await expect(provision()).rejects.toThrow('application_preparation_incomplete')
        expect(row.apps[0].errorCode).toBe('application_installation_not_ready')
        expect(sharing.grantUsers).not.toHaveBeenCalled()
    })

    it('retries storage collection without reinstalling completed Apps', async () => {
        storage.refresh.mockRejectedValueOnce(new Error('Collector unavailable'))
        await expect(provision()).rejects.toThrow('Collector unavailable')
        expect(row.readyAt).toBeUndefined()
        await provision()
        expect(applications.initialize).toHaveBeenCalledTimes(1)
        expect(storage.refresh).toHaveBeenCalledTimes(2)
        expect(row.readyAt).toBeInstanceOf(Date)
    })

    it('skips a disabled App without creating its resources', async () => {
        row.configuration.definition.apps[0].enabled = false
        await provision()
        expect(row.apps[0].status).toBe('disabled')
        expect(models.resolve).not.toHaveBeenCalled()
        expect(applications.initialize).not.toHaveBeenCalled()
    })

    it('fences a shared knowledge binding and passes the existing resource into the App lifecycle', async () => {
        const sourceId = id(40)
        const definition = row.configuration.definition
        definition.apps.unshift({
            ...definition.apps[0],
            key: 'source',
            appRef: { pluginName: 'plugin', appName: 'source' }
        })
        definition.apps[1].dependsOn = ['source']
        definition.bindings = [
            {
                type: 'knowledgebase',
                from: { app: 'source', resource: 'exported' },
                to: { app: 'main', resource: 'library' }
            }
        ]
        row.apps.unshift({ key: 'source', status: 'ready', attempts: 1, installationId: sourceId })
        installations.findOneByOrFail.mockImplementation(async ({ id: requestedId }) =>
            requestedId === sourceId
                ? { pluginName: 'plugin', appName: 'source', resourceRefs: { 'knowledgebase:exported': id(14) } }
                : installation
        )
        applications.getDefinition.mockReturnValue({
            config: { resources: { knowledgebases: { exports: ['exported'] } } }
        })
        applications.getDetail.mockResolvedValue({
            application: {
                config: {
                    resources: { knowledgebases: { imports: ['library'] } },
                    knowledgebases: [{ key: 'library' }]
                }
            },
            preflight: { toolsetRequirements: [] }
        })
        knowledgebases.findOneBy.mockResolvedValue({ id: id(14) })
        await provision()
        expect(knowledgebases.findOneBy).toHaveBeenCalledWith({
            id: id(14),
            tenantId: row.tenantId,
            organizationId: row.organizationId
        })
        expect(bindings.upsert).toHaveBeenCalledWith(
            {
                tenantId: row.tenantId,
                organizationId: row.organizationId,
                deliveryId: row.id,
                consumerApp: 'main',
                resourceKey: 'library',
                knowledgebaseId: id(14)
            },
            ['deliveryId', 'consumerApp', 'resourceKey']
        )
        expect(runner.query).toHaveBeenCalledWith(expect.stringContaining('pg_advisory_xact_lock'), [
            `app-platform-knowledge-lifecycle:${row.tenantId}`
        ])
        expect(runner.release).toHaveBeenCalled()
        expect(applications.initialize).toHaveBeenCalledWith(
            expect.any(Object),
            expect.objectContaining({ knowledgebaseBindings: new Map([['library', id(14)]]) })
        )
    })
})
