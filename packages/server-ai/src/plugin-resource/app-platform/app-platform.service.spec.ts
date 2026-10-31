import { Test, TestingModule } from '@nestjs/testing'
import { getQueueToken } from '@nestjs/bull'
import { getRepositoryToken } from '@nestjs/typeorm'
import { DataSource } from 'typeorm'
import { AIPermissionsEnum } from '@xpert-ai/contracts'
import { RequestContext } from '@xpert-ai/plugin-sdk'
import { getConfig } from '@xpert-ai/server-config'
import { User, UserOrganization } from '@xpert-ai/server-core'
import { APP_PLATFORM_QUEUE, AppPlatformService } from './app-platform.service'
import { AppPlatformDelivery } from './app-platform-delivery.entity'
import { platformConfigurationSnapshotSchema } from './platform-configuration-snapshot'

jest.mock('@xpert-ai/server-config', () => ({
    ...jest.requireActual('@xpert-ai/server-config'),
    getConfig: jest.fn(jest.requireActual('@xpert-ai/server-config').getConfig)
}))

const baseConfig = getConfig()
const parsed = platformConfigurationSnapshotSchema.parse({
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

const configuration = { definition: parsed.definition, environment: parsed.environment, digest: parsed.digest }

describe('App delivery account boundary and scheduling', () => {
    let module: TestingModule
    let service: AppPlatformService
    let row: AppPlatformDelivery
    const users = { findOne: jest.fn() }
    const memberships = { find: jest.fn() }
    const insert = { insert: jest.fn(), values: jest.fn(), orIgnore: jest.fn(), execute: jest.fn() }
    const deliveries = { findOneBy: jest.fn(), findOneByOrFail: jest.fn(), createQueryBuilder: jest.fn() }
    const queue = { getJob: jest.fn(), add: jest.fn() }

    beforeEach(async () => {
        jest.resetAllMocks()
        jest.mocked(getConfig).mockReturnValue({ ...baseConfig, appPlatform: configuration })
        jest.spyOn(RequestContext, 'currentTenantId').mockReturnValue('tenant')
        jest.spyOn(RequestContext, 'currentUserId').mockReturnValue('user')
        jest.spyOn(RequestContext, 'currentApiPrincipal').mockReturnValue(null)
        jest.spyOn(RequestContext, 'getOrganizationId').mockReturnValue('organization')
        jest.spyOn(RequestContext, 'hasPermission').mockReturnValue(true)
        users.findOne.mockResolvedValue({ id: 'user', isActive: true })
        memberships.find.mockResolvedValue([{ organizationId: 'organization' }])
        row = Object.assign(new AppPlatformDelivery(), {
            id: 'delivery',
            tenantId: 'tenant',
            organizationId: 'organization',
            userId: 'user',
            platformKey: 'platform',
            definitionVersion: 1,
            configurationDigest: configuration.digest,
            configuration,
            apps: [{ key: 'main', status: 'pending', attempts: 0 }]
        })
        deliveries.findOneBy.mockResolvedValue(row)
        deliveries.findOneByOrFail.mockResolvedValue(row)
        deliveries.createQueryBuilder.mockReturnValue(insert)
        insert.insert.mockReturnValue(insert)
        insert.values.mockReturnValue(insert)
        insert.orIgnore.mockReturnValue(insert)
        module = await Test.createTestingModule({
            providers: [
                AppPlatformService,
                {
                    provide: DataSource,
                    useValue: {
                        getRepository: (entity: typeof User | typeof UserOrganization) => {
                            if (entity === User) return users
                            if (entity === UserOrganization) return memberships
                            throw new Error('Unexpected repository')
                        }
                    }
                },
                { provide: getRepositoryToken(AppPlatformDelivery), useValue: deliveries },
                { provide: getQueueToken(APP_PLATFORM_QUEUE), useValue: queue }
            ]
        }).compile()
        service = module.get(AppPlatformService)
    })

    afterEach(async () => {
        await module.close()
        jest.restoreAllMocks()
    })

    it('exposes branding without the protected provisioning configuration', () => {
        expect(service.presentation()).toEqual({ mode: 'managed-apps', branding: { name: 'Test' } })
        jest.mocked(getConfig).mockReturnValue({ ...baseConfig, appPlatform: undefined })
        expect(service.presentation()).toEqual({ mode: 'standard' })
    })

    it('rejects an anonymous request before reading account data', async () => {
        jest.spyOn(RequestContext, 'currentUserId').mockReturnValue(null)
        await expect(service.ensureForCurrentUser()).rejects.toMatchObject({ status: 403 })
        expect(users.findOne).not.toHaveBeenCalled()
        expect(deliveries.findOneBy).not.toHaveBeenCalled()
    })

    it('does not let a resource-scoped credential initialize an account', async () => {
        jest.spyOn(RequestContext, 'currentApiPrincipal').mockReturnValue({
            ...new User(),
            principalType: 'client_secret',
            resourceScope: { kind: 'conversation', conversationId: 'conversation' }
        })
        await expect(service.ensureForCurrentUser()).rejects.toMatchObject({ status: 403 })
        expect(users.findOne).not.toHaveBeenCalled()
    })

    it.each([null, { id: 'user', isActive: false }])('rejects an unavailable account (%j)', async (user) => {
        users.findOne.mockResolvedValue(user)
        await expect(service.ensureForCurrentUser()).rejects.toMatchObject({ status: 403 })
        expect(users.findOne).toHaveBeenCalledWith(
            expect.objectContaining({ where: { id: 'user', tenantId: 'tenant', emailVerified: true } })
        )
        expect(memberships.find).not.toHaveBeenCalled()
    })

    it('requires APPLICATION_USE without testing for a special role name', async () => {
        jest.spyOn(RequestContext, 'hasPermission').mockReturnValue(false)
        await expect(service.ensureForCurrentUser()).rejects.toMatchObject({ status: 403 })
        expect(RequestContext.hasPermission).toHaveBeenCalledWith(AIPermissionsEnum.APPLICATION_USE)
        expect(queue.add).not.toHaveBeenCalled()
    })

    it.each([{ rows: [] }, { rows: [{ organizationId: 'organization' }, { organizationId: 'other' }] }])(
        'requires one active organization (%j)',
        async ({ rows }) => {
            memberships.find.mockResolvedValue(rows)
            await expect(service.ensureForCurrentUser()).rejects.toThrow('application_organization_required')
            expect(deliveries.findOneBy).not.toHaveBeenCalled()
        }
    )

    it('rejects a requested organization outside the account membership', async () => {
        jest.spyOn(RequestContext, 'getOrganizationId').mockReturnValue('other')
        await expect(service.ensureForCurrentUser()).rejects.toThrow('application_organization_denied')
        expect(deliveries.findOneBy).not.toHaveBeenCalled()
    })

    it('rejects a previously delivered organization that no longer matches', async () => {
        row.organizationId = 'other'
        await expect(service.ensureForCurrentUser()).rejects.toThrow('application_organization_denied')
        expect(queue.add).not.toHaveBeenCalled()
    })

    it('creates or reuses the unique delivery and queues its persisted snapshot', async () => {
        jest.spyOn(RequestContext, 'getOrganizationId').mockReturnValue(undefined)
        deliveries.findOneBy.mockResolvedValue(null)
        const result = await service.ensureForCurrentUser()
        expect(memberships.find).toHaveBeenCalledWith({
            where: { userId: 'user', tenantId: 'tenant', isActive: true, organization: { isActive: true } },
            take: 2
        })
        expect(insert.values).toHaveBeenCalledWith(
            expect.objectContaining({
                tenantId: 'tenant',
                organizationId: 'organization',
                userId: 'user',
                configuration,
                createdById: 'user'
            })
        )
        expect(insert.orIgnore).toHaveBeenCalled()
        expect(deliveries.findOneByOrFail).toHaveBeenCalledWith({
            tenantId: 'tenant',
            userId: 'user',
            platformKey: 'platform'
        })
        expect(queue.add).toHaveBeenCalledWith(
            { deliveryId: row.id, digest: row.configurationDigest },
            expect.objectContaining({ jobId: `${row.id}-${row.configurationDigest}`, attempts: 3 })
        )
        expect(result.ready).toBe(false)
        expect(result).not.toHaveProperty('configuration')
    })

    it('does not adopt new configuration during an ordinary login', async () => {
        row.apps[0].status = 'ready'
        jest.mocked(getConfig).mockReturnValue({
            ...baseConfig,
            appPlatform: {
                ...configuration,
                digest: 'b'.repeat(64),
                definition: { ...configuration.definition, version: 2 }
            }
        })
        const result = await service.ensureForCurrentUser()
        expect(result.version).toBe(1)
        expect(result.ready).toBe(true)
        expect(row.configurationDigest).toBe(configuration.digest)
        expect(insert.execute).not.toHaveBeenCalled()
        expect(queue.add).not.toHaveBeenCalled()
    })

    it('rejects provisioning when managed Apps are not configured', async () => {
        jest.mocked(getConfig).mockReturnValue({ ...baseConfig, appPlatform: undefined })
        await expect(service.ensureForCurrentUser()).rejects.toThrow('app_platform_not_configured')
        expect(deliveries.findOneBy).not.toHaveBeenCalled()
    })

    it.each(['waiting', 'active', 'delayed', 'failed', 'completed'])(
        'does not duplicate an existing %s job on login',
        async (state) => {
            const job = { getState: jest.fn().mockResolvedValue(state), retry: jest.fn(), remove: jest.fn() }
            queue.getJob.mockResolvedValue(job)
            await service.ensureForCurrentUser()
            expect(queue.add).not.toHaveBeenCalled()
            expect(job.retry).not.toHaveBeenCalled()
            expect(job.remove).not.toHaveBeenCalled()
        }
    )

    it.each(['waiting', 'active', 'delayed', 'failed', 'completed'])(
        'handles an explicit retry of a %s job',
        async (state) => {
            const job = { getState: jest.fn().mockResolvedValue(state), retry: jest.fn(), remove: jest.fn() }
            queue.getJob.mockResolvedValue(job)
            await service.ensureForCurrentUser(true)
            expect(job.retry).toHaveBeenCalledTimes(state === 'failed' ? 1 : 0)
            expect(job.remove).toHaveBeenCalledTimes(state === 'completed' ? 1 : 0)
            expect(queue.add).toHaveBeenCalledTimes(state === 'completed' ? 1 : 0)
        }
    )
})
