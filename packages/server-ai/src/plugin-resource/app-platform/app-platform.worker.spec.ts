import { CommandBus } from '@nestjs/cqrs'
import { ResolveExecutionIdentityCommand } from '@xpert-ai/server-core'
import { executionIdentityFixture } from '../../shared/testing/execution-identity.fixture'
import { Test, TestingModule } from '@nestjs/testing'
import { DataSource } from 'typeorm'
import { AIPermissionsEnum, UserType } from '@xpert-ai/contracts'
import { RequestContext } from '@xpert-ai/plugin-sdk'
import { getConfig } from '@xpert-ai/server-config'
import { User } from '@xpert-ai/server-core'
import { AppPlatformWorker } from './app-platform.worker'
import { AppPlatformService } from './app-platform.service'
import { PlatformProvisionerService } from './platform-provisioner.service'
import { AppPlatformDelivery } from './app-platform-delivery.entity'
import { platformConfigurationSnapshotSchema } from './platform-configuration-snapshot'
import { captureRequestContext, runWithCapturedRequestContext } from '../../shared/request-context'

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
const job = { deliveryId: '00000000-0000-4000-8000-000000000001', digest: configuration.digest }
const account = (index: number) =>
    Object.assign(new User(), {
        id: `user-${index}`,
        tenantId: `tenant-${index}`,
        type: UserType.USER,
        roleId: 'role',
        role: {
            id: 'role',
            rolePermissions: [
                {
                    permission: AIPermissionsEnum.APPLICATION_USE,
                    enabled: true,
                    roleId: 'role',
                    tenantId: `tenant-${index}`
                }
            ]
        }
    })

describe('App delivery queue worker', () => {
    let module: TestingModule
    let worker: AppPlatformWorker
    const query = {
        innerJoinAndSelect: jest.fn(),
        leftJoin: jest.fn(),
        where: jest.fn(),
        andWhere: jest.fn(),
        orderBy: jest.fn(),
        addOrderBy: jest.fn(),
        skip: jest.fn(),
        take: jest.fn(),
        getMany: jest.fn()
    }
    const users = { createQueryBuilder: jest.fn() }
    const database = { isInitialized: true, getRepository: jest.fn() }
    const platform = { ensureForCurrentUser: jest.fn() }
    const provisioner = { provision: jest.fn() }

    beforeEach(async () => {
        jest.resetAllMocks()
        jest.mocked(getConfig).mockReturnValue({ ...baseConfig, appPlatform: configuration })
        database.isInitialized = true
        database.getRepository.mockReturnValue(users)
        users.createQueryBuilder.mockReturnValue(query)
        for (const method of [
            query.innerJoinAndSelect,
            query.leftJoin,
            query.where,
            query.andWhere,
            query.orderBy,
            query.addOrderBy,
            query.skip,
            query.take
        ])
            method.mockReturnValue(query)
        query.getMany.mockResolvedValue([])
        module = await Test.createTestingModule({
            providers: [
                AppPlatformWorker,
                {
                    provide: CommandBus,
                    useValue: {
                        execute: async (command: ResolveExecutionIdentityCommand) => {
                            const candidates = await query.getMany.mock.results.at(-1)?.value
                            const user = candidates?.find((user) => user.id === command.actor.userId)
                            return executionIdentityFixture(command.actor, user)
                        }
                    }
                },
                { provide: DataSource, useValue: database },
                { provide: AppPlatformService, useValue: platform },
                { provide: PlatformProvisionerService, useValue: provisioner }
            ]
        }).compile()
        worker = module.get(AppPlatformWorker)
    })

    afterEach(async () => {
        await module.close()
        jest.restoreAllMocks()
    })

    it('passes only validated delivery identity and snapshot digest to the provisioner', async () => {
        await worker.run({ data: job })
        expect(provisioner.provision).toHaveBeenCalledWith(job.deliveryId, job.digest)
    })

    it.each([
        null,
        {},
        { ...job, deliveryId: 'invalid' },
        { ...job, digest: 'invalid' },
        { ...job, userId: 'other' },
        { ...job, configuration: {} }
    ])('rejects malformed or scope-overriding queue data (%j)', (data) => {
        expect(() => worker.run({ data })).toThrow()
        expect(provisioner.provision).not.toHaveBeenCalled()
    })

    it('propagates provisioning failures to Bull for its configured retries', async () => {
        provisioner.provision.mockRejectedValue(new Error('Provisioning failed'))
        await expect(worker.run({ data: job })).rejects.toThrow('Provisioning failed')
    })

    it.each(['unconfigured', 'database-unavailable'])('does not recover when %s', async (state) => {
        if (state === 'unconfigured') jest.mocked(getConfig).mockReturnValue({ ...baseConfig, appPlatform: undefined })
        else database.isInitialized = false
        await worker.recover()
        expect(database.getRepository).not.toHaveBeenCalled()
    })

    it('scans active verified users with a tenant-matched permission and an unfinished delivery past its cooldown', async () => {
        await worker.recover()
        expect(database.getRepository).toHaveBeenCalledWith(User)
        expect(query.innerJoinAndSelect).toHaveBeenCalledWith(
            'role.rolePermissions',
            'grant',
            expect.stringContaining('grant.tenantId = user.tenantId'),
            { permission: AIPermissionsEnum.APPLICATION_USE }
        )
        expect(query.innerJoinAndSelect.mock.calls[1][2]).toContain('grant.enabled = true')
        expect(query.leftJoin).toHaveBeenCalledWith(
            AppPlatformDelivery,
            'delivery',
            expect.stringContaining('delivery.tenantId = user.tenantId'),
            { platform: 'platform' }
        )
        expect(query.where).toHaveBeenCalledWith('user.type = :type', { type: UserType.USER })
        expect(query.andWhere).toHaveBeenCalledWith('user.isActive = true')
        expect(query.andWhere).toHaveBeenCalledWith('user.emailVerified = true')
        expect(query.andWhere).toHaveBeenCalledWith(expect.stringContaining("NOT IN ('ready', 'disabled')"))
        expect(query.andWhere).toHaveBeenCalledWith(expect.stringContaining('delivery.retryAfter < NOW()'))
        expect(query.orderBy).toHaveBeenCalledWith('user.createdAt', 'ASC')
        expect(query.addOrderBy).toHaveBeenCalledWith('user.id', 'ASC')
        expect(query.take).toHaveBeenCalledWith(25)
    })

    it('isolates each account context and restores the caller context after recovery', async () => {
        query.getMany.mockResolvedValue([account(1), account(2)])
        const observed: object[] = []
        platform.ensureForCurrentUser.mockImplementation(async () => {
            observed.push({
                userId: RequestContext.currentUserId(),
                tenantId: RequestContext.currentTenantId(),
                organizationId: RequestContext.getOrganizationId(),
                allowed: RequestContext.hasPermission(AIPermissionsEnum.APPLICATION_USE)
            })
        })
        await runWithCapturedRequestContext(
            captureRequestContext({ user: account(0), tenantId: 'tenant-0', organizationId: 'caller-org' }),
            async () => {
                await worker.recover()
                expect(RequestContext.currentUserId()).toBe('user-0')
                expect(RequestContext.getOrganizationId()).toBe('caller-org')
            }
        )
        expect(observed).toEqual(
            [1, 2].map((index) => ({
                userId: `user-${index}`,
                tenantId: `tenant-${index}`,
                organizationId: null,
                allowed: true
            }))
        )
        expect(platform.ensureForCurrentUser.mock.calls).toEqual([[], []])
    })

    it('continues with other accounts after one account fails revalidation', async () => {
        query.getMany.mockResolvedValue([account(1), account(2)])
        platform.ensureForCurrentUser.mockRejectedValueOnce(new Error('Account no longer authorized'))
        await worker.recover()
        expect(platform.ensureForCurrentUser).toHaveBeenCalledTimes(2)
    })

    it('pages through candidates and resets its cursor after the final page', async () => {
        query.getMany
            .mockResolvedValueOnce(Array.from({ length: 25 }, (_, index) => account(index)))
            .mockResolvedValueOnce([account(25)])
            .mockResolvedValueOnce([])
        await worker.recover()
        await worker.recover()
        await worker.recover()
        expect(query.skip.mock.calls).toEqual([[0], [25], [0]])
        expect(platform.ensureForCurrentUser).toHaveBeenCalledTimes(26)
    })

    it('does not overlap recovery scans while account handling is still in progress', async () => {
        let release: () => void = () => undefined
        let entered: () => void = () => undefined
        const handling = new Promise<void>((resolve) => {
            entered = resolve
        })
        const pending = new Promise<void>((resolve) => {
            release = resolve
        })
        query.getMany.mockResolvedValue([account(1)])
        platform.ensureForCurrentUser.mockImplementation(async () => {
            entered()
            await pending
        })
        const first = worker.recover()
        await handling
        try {
            await worker.recover()
            expect(query.getMany).toHaveBeenCalledTimes(1)
        } finally {
            release()
            await first
        }
        await worker.recover()
        expect(query.getMany).toHaveBeenCalledTimes(2)
    })

    it('releases its recovery guard after a scan failure', async () => {
        query.getMany.mockRejectedValueOnce(new Error('Database unavailable'))
        await expect(worker.recover()).rejects.toThrow('Database unavailable')
        await worker.recover()
        expect(query.getMany).toHaveBeenCalledTimes(2)
    })
})
