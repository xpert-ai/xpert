import { Test, TestingModule } from '@nestjs/testing'
import { CommandBus } from '@nestjs/cqrs'
import { DataSource } from 'typeorm'
import { ApplicationInitializationLocks } from '../application/application-initialization-locks'
import { AppPlatformService } from './app-platform.service'
import {
    AiModelTypeEnum,
    appPlatformDefinitionSchema,
    appPlatformEnvironmentSchema,
    RolesEnum
} from '@xpert-ai/contracts'
import { RequestContext } from '@xpert-ai/plugin-sdk'
import { getConfig } from '@xpert-ai/server-config'
import { User } from '@xpert-ai/server-core'
import { AppPlatformDelivery } from './app-platform-delivery.entity'
import { PlatformUpdateService } from './platform-update.service'

jest.mock('@xpert-ai/server-config', () => ({
    ...jest.requireActual('@xpert-ai/server-config'),
    getConfig: jest.fn(jest.requireActual('@xpert-ai/server-config').getConfig)
}))

describe('explicit platform adoption', () => {
    const definition = appPlatformDefinitionSchema.parse({
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
    })
    const environment = appPlatformEnvironmentSchema.parse({
        schemaVersion: 1,
        configurations: { default: { primary: { provider: 'provider', model: 'model' } } },
        plans: {
            trial: { trialDays: 7, creditLimit: 100, maxProjects: 10, maxUploadBytes: 1000, maxConcurrentRuns: 2 }
        }
    })
    let row: AppPlatformDelivery
    const deliveries = { findOneBy: jest.fn(), findAndCount: jest.fn(), save: jest.fn() }
    const users = { findOne: jest.fn() }
    const platform = { status: jest.fn(async (value) => value), enqueue: jest.fn() }
    const manager = { getRepository: jest.fn(() => deliveries) }
    const database = {
        getRepository: jest.fn((entity) => (entity === User ? users : deliveries)),
        transaction: jest.fn(async (run) => run(manager))
    }
    const commands = { execute: jest.fn() }
    const locks = { run: jest.fn(async (_key, run) => run()) }
    let service: PlatformUpdateService
    let module: TestingModule

    beforeEach(async () => {
        jest.clearAllMocks()
        commands.execute.mockResolvedValue(undefined)
        jest.spyOn(RequestContext, 'currentApiPrincipal').mockReturnValue(null)
        jest.spyOn(RequestContext, 'currentTenantId').mockReturnValue('tenant')
        jest.spyOn(RequestContext, 'hasPermission').mockReturnValue(true)
        jest.spyOn(RequestContext, 'currentUserId').mockReturnValue('operator')
        users.findOne.mockResolvedValue({ id: 'operator', role: { name: RolesEnum.SUPER_ADMIN } })
        row = Object.assign(new AppPlatformDelivery(), {
            id: 'delivery',
            userId: 'beneficiary',
            tenantId: 'tenant',
            platformKey: 'platform',
            definitionVersion: 1,
            configurationDigest: 'a'.repeat(64),
            configuration: { definition, environment, digest: 'a'.repeat(64) },
            readyAt: new Date(),
            apps: [
                { key: 'main', status: 'ready', attempts: 1, installationId: '00000000-0000-4000-8000-000000000001' }
            ]
        })
        deliveries.findOneBy.mockResolvedValue(row)
        jest.mocked(getConfig).mockReturnValue({
            appPlatform: {
                definition: { ...definition, version: 2 },
                environment,
                digest: 'b'.repeat(64)
            }
        } as ReturnType<typeof getConfig>)
        module = await Test.createTestingModule({
            providers: [
                PlatformUpdateService,
                { provide: DataSource, useValue: database },
                { provide: ApplicationInitializationLocks, useValue: locks },
                { provide: AppPlatformService, useValue: platform },
                { provide: CommandBus, useValue: commands }
            ]
        }).compile()
        service = module.get(PlatformUpdateService)
    })
    afterEach(async () => {
        await module.close()
        jest.restoreAllMocks()
    })

    it('queues an actual durable release for existing installations, preserving their identities', async () => {
        const installationId = row.apps[0].installationId
        await service.adopt(row.id, row.configurationDigest)
        expect(row.apps[0]).toMatchObject({ installationId, status: 'pending', updateOperationId: expect.any(String) })
        expect(row.readyAt).toBeInstanceOf(Date)
        expect(row.apps[0].appliedDigest).toBe('a'.repeat(64))
        expect(commands.execute).toHaveBeenCalledWith(
            expect.objectContaining({
                input: { tenantId: 'tenant', userId: 'beneficiary', actorId: 'operator', planCode: 'trial' },
                manager
            })
        )
        expect(deliveries.save).toHaveBeenCalledWith(row)
        expect(platform.enqueue).toHaveBeenCalledWith(row, true)
        const operationId = row.apps[0].updateOperationId
        await service.adopt(row.id, row.configurationDigest)
        expect(row.apps[0].updateOperationId).toBe(operationId)
        expect(platform.enqueue).toHaveBeenCalledTimes(1)
    })

    it('lists operator delivery summaries without returning protected configuration', async () => {
        deliveries.findAndCount.mockResolvedValue([[row], 1])
        await service.list({ skip: 0, take: 10, userId: 'beneficiary' })
        expect(deliveries.findAndCount).toHaveBeenCalledWith(
            expect.objectContaining({
                where: { tenantId: 'tenant', platformKey: 'platform', userId: 'beneficiary' },
                skip: 0,
                take: 10,
                select: expect.not.arrayContaining(['configuration'])
            })
        )
        users.findOne.mockResolvedValue({ role: { name: RolesEnum.APP_USER } })
        jest.spyOn(RequestContext, 'hasPermission').mockReturnValue(false)
        await expect(service.list({ skip: 0, take: 10 })).rejects.toMatchObject({ status: 403 })
        expect(deliveries.findAndCount).toHaveBeenCalledTimes(1)
    })

    it('does not replace the snapshot of an unfinished release', async () => {
        row.apps[0].updateOperationId = '00000000-0000-4000-8000-000000000002'
        await expect(service.adopt(row.id, row.configurationDigest)).rejects.toThrow()
        expect(row.configurationDigest).toBe('a'.repeat(64))
        expect(deliveries.save).not.toHaveBeenCalled()
    })

    it('adopts a new auxiliary model through the same durable update without replacing installation identity', async () => {
        const config = getConfig().appPlatform
        config.environment = {
            ...environment,
            configurations: {
                default: {
                    ...environment.configurations.default,
                    auxiliaryModels: [{ provider: 'provider', model: 'new-image', modelType: AiModelTypeEnum.IMAGE }]
                }
            }
        }
        const installationId = row.apps[0].installationId
        await service.adopt(row.id, row.configurationDigest)
        expect(commands.execute).toHaveBeenCalledTimes(1)
        expect(row.apps[0]).toMatchObject({ installationId, status: 'pending' })
    })

    it('does not persist or schedule a definition when membership policy adoption fails', async () => {
        commands.execute.mockRejectedValue(new Error('Membership policy unavailable'))
        await expect(service.adopt(row.id, row.configurationDigest)).rejects.toThrow('Membership policy unavailable')
        expect(deliveries.save).not.toHaveBeenCalled()
        expect(platform.enqueue).not.toHaveBeenCalled()
    })

    it.each(['embedding', 'vision', 'tools', 'bindings'])(
        'rejects an unapplied %s change without replacing the active configuration',
        async (kind) => {
            const config = getConfig().appPlatform
            if (kind === 'embedding')
                config.environment = {
                    ...environment,
                    configurations: {
                        default: {
                            ...environment.configurations.default,
                            embedding: { provider: 'provider', model: 'new-embedding' }
                        }
                    }
                }
            if (kind === 'vision')
                config.environment = {
                    ...environment,
                    configurations: {
                        default: {
                            ...environment.configurations.default,
                            vision: { provider: 'provider', model: 'new-vision' }
                        }
                    }
                }
            if (kind === 'tools')
                config.environment = {
                    ...environment,
                    configurations: {
                        default: {
                            ...environment.configurations.default,
                            tools: [{ provider: 'image', sourceName: 'new-source' }]
                        }
                    }
                }
            if (kind === 'bindings')
                config.definition = {
                    ...config.definition,
                    bindings: [
                        {
                            type: 'knowledgebase',
                            from: { app: 'support', resource: 'source' },
                            to: { app: 'main', resource: 'library' }
                        }
                    ]
                }
            await expect(service.adopt(row.id, row.configurationDigest)).rejects.toMatchObject({ status: 409 })
            expect(row.configurationDigest).toBe('a'.repeat(64))
            expect(row.apps[0].status).toBe('ready')
            expect(deliveries.save).not.toHaveBeenCalled()
            expect(platform.enqueue).not.toHaveBeenCalled()
        }
    )

    it('rejects application users and stale operator requests before scheduling mutations', async () => {
        users.findOne.mockResolvedValue({ role: { name: RolesEnum.APP_USER } })
        jest.spyOn(RequestContext, 'hasPermission').mockReturnValue(false)
        await expect(service.adopt(row.id, row.configurationDigest)).rejects.toThrow()
        users.findOne.mockResolvedValue({ role: { name: RolesEnum.ADMIN } })
        jest.spyOn(RequestContext, 'hasPermission').mockReturnValue(true)
        await expect(service.adopt(row.id, 'c'.repeat(64))).rejects.toThrow()
        expect(deliveries.save).not.toHaveBeenCalled()
        expect(platform.enqueue).not.toHaveBeenCalled()
    })

    it.each(['currentTenantId', 'currentUserId'] as const)(
        'rejects a missing %s before database access',
        async (method) => {
            jest.spyOn(RequestContext, method).mockReturnValue(null)
            await expect(service.adopt(row.id, row.configurationDigest)).rejects.toMatchObject({ status: 403 })
            await expect(service.list({ skip: 0, take: 10 })).rejects.toMatchObject({ status: 403 })
            expect(database.getRepository).not.toHaveBeenCalled()
            expect(platform.enqueue).not.toHaveBeenCalled()
        }
    )

    it('rejects resource-scoped credentials before operator lookup', async () => {
        jest.spyOn(RequestContext, 'currentApiPrincipal').mockReturnValue({
            ...new User(),
            principalType: 'client_secret',
            resourceScope: { kind: 'conversation', conversationId: 'conversation' }
        })
        await expect(service.adopt(row.id, row.configurationDigest)).rejects.toMatchObject({ status: 403 })
        expect(users.findOne).not.toHaveBeenCalled()
    })

    it.each([null, { id: 'operator', isActive: false }])('rejects an unavailable operator (%j)', async (actor) => {
        users.findOne.mockResolvedValue(actor)
        await expect(service.adopt(row.id, row.configurationDigest)).rejects.toMatchObject({ status: 403 })
        expect(deliveries.findOneBy).not.toHaveBeenCalled()
    })

    it('scopes both the operator and delivery lookup to the current tenant', async () => {
        deliveries.findOneBy.mockResolvedValue(null)
        await expect(service.adopt('foreign-delivery', row.configurationDigest)).rejects.toMatchObject({ status: 409 })
        expect(users.findOne).toHaveBeenCalledWith(
            expect.objectContaining({ where: { id: 'operator', tenantId: 'tenant' } })
        )
        expect(deliveries.findOneBy).toHaveBeenCalledWith({
            id: 'foreign-delivery',
            tenantId: 'tenant',
            platformKey: 'platform'
        })
        expect(database.transaction).not.toHaveBeenCalled()
        expect(platform.enqueue).not.toHaveBeenCalled()
    })

    it.each(['same-version', 'older-version', 'application', 'plan'])(
        'rejects a conflicting %s change before mutation',
        async (kind) => {
            const config = getConfig().appPlatform
            if (kind === 'same-version') config.definition = { ...config.definition, version: 1 }
            if (kind === 'older-version') {
                row.definitionVersion = 3
            }
            if (kind === 'application')
                config.definition = {
                    ...config.definition,
                    apps: config.definition.apps.map((app) => ({
                        ...app,
                        appRef: { ...app.appRef, appName: 'replacement' }
                    }))
                }
            if (kind === 'plan')
                config.definition = { ...config.definition, entitlements: { defaultPlanRef: 'replacement' } }
            await expect(service.adopt(row.id, row.configurationDigest)).rejects.toMatchObject({ status: 409 })
            expect(row.configurationDigest).toBe('a'.repeat(64))
            expect(row.apps[0].status).toBe('ready')
            expect(database.transaction).not.toHaveBeenCalled()
            expect(platform.enqueue).not.toHaveBeenCalled()
        }
    )

    it('does not dispatch a release when persisting the new snapshot fails', async () => {
        deliveries.save.mockRejectedValueOnce(new Error('Persistence unavailable'))
        await expect(service.adopt(row.id, row.configurationDigest)).rejects.toThrow('Persistence unavailable')
        expect(platform.enqueue).not.toHaveBeenCalled()
    })
})
