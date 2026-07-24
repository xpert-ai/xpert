jest.mock('../xpert/xpert.entity', () => ({
    Xpert: class Xpert {}
}))

import { MembershipService } from './membership.service'
import { MembershipPlan } from './membership-plan.entity'
import { MembershipPeriod } from './membership-period.entity'
import { MembershipPointLedger } from './membership-point-ledger.entity'
import { UserMembership } from './user-membership.entity'
import { Xpert } from '../xpert/xpert.entity'
import { FeatureOrganization, RequestContext, User } from '@xpert-ai/server-core'
import {
    DEFAULT_MEMBERSHIP_TOKENS_PER_POINT,
    MEMBERSHIP_TOKENS_PER_POINT_SETTING,
    MEMBERSHIP_TOKENS_PER_POINT_OPTIONS,
    MembershipLedgerSourceEnum,
    MembershipPeriodEnum,
    MembershipPeriodStatusEnum,
    MembershipPlanStatusEnum,
    MembershipRenewalModeEnum,
    MembershipSourceEnum,
    MembershipStatusEnum,
    UserType
} from '@xpert-ai/contracts'
import i18next from 'i18next'

describe('MembershipService', () => {
    afterEach(() => {
        jest.restoreAllMocks()
    })

    type FeatureToggleFixture = {
        isEnabled: boolean
        feature?: {
            parentId?: string | null
        }
    }

    type MembershipServiceTestAccess = {
        findUsableMembership: (...args: unknown[]) => Promise<unknown>
        hasActivePlan: (...args: unknown[]) => Promise<boolean>
        getPersonalPointsBalance: (...args: unknown[]) => Promise<number>
        createLedger: (...args: unknown[]) => Promise<MembershipPointLedger>
        assertRateLimits: (...args: unknown[]) => Promise<void>
        findActiveMembership: (...args: unknown[]) => Promise<unknown>
        findMembershipForUpdate: (...args: unknown[]) => Promise<unknown>
        renewMembership: (...args: unknown[]) => Promise<unknown>
        createMembershipStatusLedger: (...args: unknown[]) => Promise<void>
        requireManagedMembership: (...args: unknown[]) => Promise<unknown>
        findMembershipById: (...args: unknown[]) => Promise<unknown>
    }

    function getMembershipServiceTestAccess(service: MembershipService): MembershipServiceTestAccess {
        return service as unknown as MembershipServiceTestAccess
    }

    function createQueryBuilder(rawRows: Array<Record<string, unknown>>) {
        return {
            select: jest.fn().mockReturnThis(),
            addSelect: jest.fn().mockReturnThis(),
            leftJoin: jest.fn().mockReturnThis(),
            where: jest.fn().mockReturnThis(),
            andWhere: jest.fn().mockReturnThis(),
            groupBy: jest.fn().mockReturnThis(),
            addGroupBy: jest.fn().mockReturnThis(),
            orderBy: jest.fn().mockReturnThis(),
            take: jest.fn().mockReturnThis(),
            skip: jest.fn().mockReturnThis(),
            getRawMany: jest.fn().mockResolvedValue(rawRows)
        }
    }

    function createMembership(overrides: Partial<UserMembership> = {}): UserMembership & {
        plan: NonNullable<UserMembership['plan']>
        planId: string
    } {
        return {
            id: 'membership-owner',
            tenantId: 'tenant-1',
            userId: 'owner-user',
            planId: 'plan-1',
            status: MembershipStatusEnum.Active,
            source: MembershipSourceEnum.Admin,
            renewalMode: MembershipRenewalModeEnum.Auto,
            currentPeriodStart: new Date('2026-07-01T00:00:00.000Z'),
            currentPeriodEnd: new Date('2026-08-01T00:00:00.000Z'),
            pointsGranted: 100,
            pointsUsed: 2,
            pointsTotalUsed: 0,
            plan: {
                id: 'plan-1',
                tenantId: 'tenant-1',
                code: 'default',
                name: 'Default',
                status: MembershipPlanStatusEnum.Active,
                period: MembershipPeriodEnum.Monthly,
                includedPoints: 100,
                tokensPerPoint: 1000,
                modelMultipliers: [],
                rateLimits: []
            },
            ...overrides
        } as UserMembership & { plan: NonNullable<UserMembership['plan']>; planId: string }
    }

    function createPlan(overrides: Partial<MembershipPlan> = {}): MembershipPlan {
        return {
            id: 'plan-1',
            tenantId: 'tenant-1',
            organizationId: null,
            code: 'default',
            name: 'Default',
            status: MembershipPlanStatusEnum.Active,
            isDefault: true,
            period: MembershipPeriodEnum.Monthly,
            includedPoints: 1000,
            tokensPerPoint: 1000,
            modelMultipliers: [],
            rateLimits: [],
            ...overrides
        } as MembershipPlan
    }

    function createMembershipFeatureRepository(
        resolveRows: (
            organizationId: string | null
        ) => FeatureToggleFixture[] | Promise<FeatureToggleFixture[]> = () => [{ isEnabled: true }]
    ) {
        const queryBuilders: Array<{
            leftJoinAndSelect: jest.Mock
            where: jest.Mock
            andWhere: jest.Mock
            getMany: jest.Mock
        }> = []
        const repository = {
            createQueryBuilder: jest.fn(() => {
                let scopeOrganizationId: string | null = null
                const queryBuilder = {
                    leftJoinAndSelect: jest.fn().mockReturnThis(),
                    where: jest.fn().mockReturnThis(),
                    andWhere: jest.fn((where: string, parameters?: { organizationId?: string }) => {
                        if (where.includes('organizationId = :organizationId')) {
                            scopeOrganizationId = parameters?.organizationId ?? null
                        }
                        if (where.includes('organizationId IS NULL')) {
                            scopeOrganizationId = null
                        }
                        return queryBuilder
                    }),
                    getMany: jest.fn(() => Promise.resolve(resolveRows(scopeOrganizationId)))
                }
                queryBuilders.push(queryBuilder)
                return queryBuilder
            })
        }

        return { repository, queryBuilders }
    }

    function createMembershipService(
        dataSource: never = {} as never,
        planRepository: never = {} as never,
        membershipRepository: never = {} as never,
        ledgerRepository: never = {} as never,
        xpertRepository: never = {} as never,
        userRepository: never | undefined = {
            findOne: jest.fn(async ({ where }) => ({ id: where.id, tenantId: where.tenantId, type: UserType.USER })),
            find: jest.fn().mockResolvedValue([{ id: 'user-1' }, { id: 'user-2' }])
        } as never,
        userOrganizationRepository: never | undefined = undefined,
        copilotRepository: never | undefined = undefined,
        featureOrganizationRepository: never | undefined = createMembershipFeatureRepository().repository as never,
        tenantSettingRepository: never | undefined = undefined,
        periodRepository: never | undefined = undefined
    ) {
        return new MembershipService(
            dataSource,
            planRepository,
            membershipRepository,
            ledgerRepository,
            xpertRepository,
            userRepository as never,
            userOrganizationRepository,
            copilotRepository,
            featureOrganizationRepository,
            tenantSettingRepository,
            periodRepository
        )
    }

    it('calculates fractional points directly from token usage without rounding per call', () => {
        const service = createMembershipService({} as never, {} as never, {} as never, {} as never, {} as never)
        const plan = createPlan({ tokensPerPoint: 100000 })

        expect(service.calculatePoints(28_868_663, plan, 'tongyi', 'qwen3.6-plus', 100000)).toBe(288.68663)
        expect(service.calculatePoints(1, plan, 'tongyi', 'qwen3.6-plus', 100000)).toBe(0.00001)
    })

    it('matches explicitly allowed membership models and keeps empty rules unrestricted', () => {
        const service = createMembershipService({} as never, {} as never, {} as never, {} as never, {} as never)

        expect(service.isModelAllowed(createPlan({ allowedModels: [] }), 'tongyi', 'qwen3.6-plus')).toBe(true)
        expect(
            service.isModelAllowed(
                createPlan({ allowedModels: [{ provider: 'tongyi', model: 'qwen3.6-plus' }] }),
                'tongyi',
                'qwen3.6-plus'
            )
        ).toBe(true)
        expect(
            service.isModelAllowed(
                createPlan({ allowedModels: [{ provider: 'tongyi', model: '*' }] }),
                'tongyi',
                'qwen-max'
            )
        ).toBe(true)
        expect(
            service.isModelAllowed(
                createPlan({ allowedModels: [{ provider: 'tongyi', model: 'qwen3.6-plus' }] }),
                'tongyi',
                'qwen-max'
            )
        ).toBe(false)
    })

    function createScopeInitializationHarness(
        tokensPerPointSetting?: string,
        resolveFeatureRows: (
            organizationId: string | null
        ) => FeatureToggleFixture[] | Promise<FeatureToggleFixture[]> = () => [{ isEnabled: true }]
    ) {
        const plans: MembershipPlan[] = []
        const memberships: UserMembership[] = []
        const periods: MembershipPeriod[] = []
        const ledgers: MembershipPointLedger[] = []
        const matchesScope = (
            record: { tenantId?: string; organizationId?: string | null },
            where?: { tenantId?: string; organizationId?: unknown }
        ) => {
            const organizationId = typeof where?.organizationId === 'string' ? where.organizationId : null
            return record.tenantId === where?.tenantId && (record.organizationId ?? null) === organizationId
        }
        const featureOrganizationRepository = createMembershipFeatureRepository(resolveFeatureRows).repository
        const tenantSettingRepository = {
            findOne: jest.fn().mockResolvedValue(
                tokensPerPointSetting
                    ? {
                          tenantId: 'tenant-1',
                          name: MEMBERSHIP_TOKENS_PER_POINT_SETTING,
                          value: tokensPerPointSetting
                      }
                    : null
            )
        }
        const updateBuilder = {
            update: jest.fn().mockReturnThis(),
            set: jest.fn().mockReturnThis(),
            where: jest.fn().mockReturnThis(),
            andWhere: jest.fn().mockReturnThis(),
            getCount: jest.fn().mockResolvedValue(0),
            execute: jest.fn().mockResolvedValue(undefined)
        }
        const planRepository = {
            createQueryBuilder: jest.fn().mockReturnValue(updateBuilder),
            create: jest.fn((input) => ({ id: 'plan-default', ...input })),
            count: jest.fn(async ({ where }) => {
                return plans.filter((plan) => matchesScope(plan, where) && plan.status === where?.status).length
            }),
            find: jest.fn(async ({ where }) => plans.filter((plan) => matchesScope(plan, where))),
            findOne: jest.fn(async ({ where }) => {
                const scopedPlans = plans.filter((plan) => matchesScope(plan, where))
                if (where?.id) {
                    return scopedPlans.find((plan) => plan.id === where.id) ?? null
                }
                if (where?.status === MembershipPlanStatusEnum.Active && where?.isDefault === true) {
                    return (
                        scopedPlans.find((plan) => plan.status === MembershipPlanStatusEnum.Active && plan.isDefault) ??
                        null
                    )
                }
                if (where?.status === MembershipPlanStatusEnum.Active && where?.isDefault === undefined) {
                    return scopedPlans.find((plan) => plan.status === MembershipPlanStatusEnum.Active) ?? null
                }
                if (where?.code === 'default-unlimited') {
                    return scopedPlans.find((plan) => plan.code === 'default-unlimited') ?? null
                }
                return null
            }),
            save: jest.fn(async (plan) => {
                const saved = { ...plan, id: plan.id ?? `plan-${plans.length + 1}` } as MembershipPlan
                const index = plans.findIndex((item) => item.id === saved.id)
                if (index >= 0) {
                    plans[index] = saved
                } else {
                    plans.push(saved)
                }
                return saved
            }),
            remove: jest.fn(async (plan) => {
                const index = plans.findIndex((item) => item.id === plan.id)
                if (index >= 0) {
                    plans.splice(index, 1)
                }
                return plan
            })
        }
        const userOrganizationRepository = {
            find: jest.fn().mockResolvedValue([{ userId: 'user-1' }, { userId: 'user-2' }]),
            findOne: jest.fn(async ({ where }) =>
                ['user-1', 'user-2'].includes(where.userId)
                    ? {
                          id: `membership-${where.userId}`,
                          tenantId: where.tenantId,
                          organizationId: where.organizationId,
                          userId: where.userId,
                          isActive: true
                      }
                    : null
            )
        }
        const userRepository = {
            findOne: jest.fn(async ({ where }) => ({ id: where.id, tenantId: where.tenantId, type: UserType.USER })),
            find: jest.fn().mockResolvedValue([{ id: 'user-1' }, { id: 'user-2' }])
        }
        const membershipRepository = {
            createQueryBuilder: jest.fn(() => {
                let tenantId: string | undefined
                let organizationId: string | null | undefined
                let userId: string | undefined
                let planId: string | undefined
                let status: MembershipStatusEnum | undefined
                let statuses: MembershipStatusEnum[] | undefined
                let retainedMembershipId: string | undefined
                const capture = (
                    condition: string,
                    parameters?: {
                        tenantId?: string
                        organizationId?: string
                        userId?: string
                        planId?: string
                        status?: MembershipStatusEnum
                        statuses?: MembershipStatusEnum[]
                        retainedMembershipId?: string
                    }
                ) => {
                    if (condition.includes('tenantId = :tenantId')) tenantId = parameters?.tenantId
                    if (condition.includes('organizationId = :organizationId')) {
                        organizationId = parameters?.organizationId
                    }
                    if (condition.includes('organizationId IS NULL')) organizationId = null
                    if (condition.includes('userId = :userId')) userId = parameters?.userId
                    if (condition.includes('planId = :planId')) planId = parameters?.planId
                    if (condition.includes('status = :status')) status = parameters?.status
                    if (condition.includes('status IN (:...statuses)')) statuses = parameters?.statuses
                    if (condition.includes('id != :retainedMembershipId')) {
                        retainedMembershipId = parameters?.retainedMembershipId
                    }
                }
                const queryBuilder = {
                    leftJoinAndSelect: jest.fn().mockReturnThis(),
                    innerJoin: jest.fn().mockReturnThis(),
                    where: jest.fn((condition, parameters) => {
                        capture(condition, parameters)
                        return queryBuilder
                    }),
                    andWhere: jest.fn((condition, parameters) => {
                        capture(condition, parameters)
                        return queryBuilder
                    }),
                    orderBy: jest.fn().mockReturnThis(),
                    setLock: jest.fn().mockReturnThis(),
                    getOne: jest.fn(async () => {
                        const candidates = memberships
                            .filter(
                                (membership) =>
                                    membership.tenantId === tenantId &&
                                    (membership.organizationId ?? null) === organizationId &&
                                    membership.userId === userId &&
                                    (status === undefined || membership.status === status) &&
                                    (!statuses?.length || statuses.includes(membership.status))
                            )
                            .sort(
                                (left, right) =>
                                    new Date(right.updatedAt ?? 0).getTime() - new Date(left.updatedAt ?? 0).getTime()
                            )
                        return candidates[0] ?? null
                    }),
                    getCount: jest.fn(
                        async () =>
                            memberships.filter(
                                (membership) =>
                                    membership.tenantId === tenantId &&
                                    (planId === undefined || membership.planId === planId)
                            ).length
                    ),
                    getMany: jest.fn(async () =>
                        memberships.filter(
                            (membership) =>
                                membership.tenantId === tenantId &&
                                (organizationId === undefined ||
                                    (membership.organizationId ?? null) === organizationId) &&
                                (userId === undefined || membership.userId === userId) &&
                                (planId === undefined || membership.planId === planId) &&
                                (status === undefined || membership.status === status) &&
                                (!statuses?.length || statuses.includes(membership.status)) &&
                                (retainedMembershipId === undefined || membership.id !== retainedMembershipId)
                        )
                    )
                }
                return queryBuilder
            }),
            create: jest.fn((input) => ({ id: `membership-${memberships.length + 1}`, ...input })),
            count: jest.fn(
                async ({ where }) =>
                    memberships.filter(
                        (membership) =>
                            matchesScope(membership, where) &&
                            (where?.status === undefined || membership.status === where.status) &&
                            (where?.planId === undefined || membership.planId === where.planId)
                    ).length
            ),
            find: jest.fn(async ({ where }) =>
                memberships
                    .filter(
                        (membership) =>
                            matchesScope(membership, where) &&
                            (where?.status === undefined || membership.status === where.status)
                    )
                    .map((membership) => ({ userId: membership.userId }))
            ),
            findOne: jest.fn(
                async ({ where }) => memberships.find((membership) => membership.id === where?.id) ?? null
            ),
            save: jest.fn(async (membership) => {
                const saved = {
                    ...membership,
                    id: membership.id ?? `membership-${memberships.length + 1}`
                } as UserMembership
                const index = memberships.findIndex((item) => item.id === saved.id)
                if (index >= 0) {
                    memberships[index] = saved
                } else {
                    memberships.push(saved)
                }
                return saved
            })
        }
        const ledgerRepository = {
            findOne: jest.fn(
                async ({ where }) =>
                    ledgers.find(
                        (ledger) =>
                            ledger.tenantId === where?.tenantId && ledger.sourceReference === where?.sourceReference
                    ) ?? null
            ),
            create: jest.fn((input) => ({ id: `ledger-${ledgers.length + 1}`, ...input })),
            save: jest.fn(async (ledger) => {
                ledgers.push(ledger as MembershipPointLedger)
                return ledger as MembershipPointLedger
            })
        }
        const periodRepository = {
            create: jest.fn((input) => ({ id: `period-${periods.length + 1}`, ...input })),
            save: jest.fn(async (period) => {
                const saved = {
                    ...period,
                    id: period.id ?? `period-${periods.length + 1}`
                } as MembershipPeriod
                const index = periods.findIndex((item) => item.id === saved.id)
                if (index >= 0) {
                    periods[index] = saved
                } else {
                    periods.push(saved)
                }
                return saved
            }),
            findOne: jest.fn(async ({ where, order }) => {
                const matches = periods
                    .filter(
                        (period) =>
                            matchesScope(period, where) &&
                            (where?.id === undefined || period.id === where.id) &&
                            (where?.userId === undefined || period.userId === where.userId) &&
                            (where?.membershipId === undefined || period.membershipId === where.membershipId) &&
                            (where?.sourceReference === undefined ||
                                period.sourceReference === where.sourceReference) &&
                            (typeof where?.status !== 'string' || period.status === where.status)
                    )
                    .sort((left, right) => {
                        const direction = order?.periodEnd === 'DESC' || order?.periodStart === 'DESC' ? -1 : 1
                        const leftDate = new Date(order?.periodEnd ? left.periodEnd : left.periodStart).getTime()
                        const rightDate = new Date(order?.periodEnd ? right.periodEnd : right.periodStart).getTime()
                        return (leftDate - rightDate) * direction
                    })
                return matches[0] ?? null
            }),
            find: jest.fn(async ({ where, order }) =>
                periods
                    .filter(
                        (period) =>
                            (where?.tenantId === undefined || period.tenantId === where.tenantId) &&
                            (where?.membershipId === undefined || period.membershipId === where.membershipId) &&
                            (where?.userId === undefined || period.userId === where.userId) &&
                            (where?.sourceReference === undefined ||
                                period.sourceReference === where.sourceReference) &&
                            (typeof where?.status !== 'string' || period.status === where.status)
                    )
                    .sort((left, right) => {
                        const direction = order?.periodStart === 'DESC' ? -1 : 1
                        return (
                            (new Date(left.periodStart).getTime() - new Date(right.periodStart).getTime()) * direction
                        )
                    })
            ),
            createQueryBuilder: jest.fn(() => {
                let membershipId: string | undefined
                let status: MembershipPeriodStatusEnum | undefined
                let nextStatus: MembershipPeriodStatusEnum | undefined
                const builder = {
                    update: jest.fn().mockReturnThis(),
                    set: jest.fn((input) => {
                        nextStatus = input.status
                        return builder
                    }),
                    where: jest.fn((_condition, parameters) => {
                        membershipId = parameters?.membershipId
                        return builder
                    }),
                    andWhere: jest.fn((_condition, parameters) => {
                        status = parameters?.status
                        return builder
                    }),
                    execute: jest.fn(async () => {
                        periods
                            .filter(
                                (period) =>
                                    period.membershipId === membershipId &&
                                    (status === undefined || period.status === status)
                            )
                            .forEach((period) => {
                                if (nextStatus) {
                                    period.status = nextStatus
                                }
                            })
                    })
                }
                return builder
            })
        }
        const manager = {
            getRepository: jest.fn((entity) => {
                if (entity === MembershipPlan) {
                    return planRepository
                }
                if (entity === UserMembership) {
                    return membershipRepository
                }
                if (entity === MembershipPointLedger) {
                    return ledgerRepository
                }
                if (entity === MembershipPeriod) {
                    return periodRepository
                }
                if (entity === FeatureOrganization) {
                    return featureOrganizationRepository
                }
                if (entity === User) {
                    return userRepository
                }
                return userOrganizationRepository
            })
        }
        const transactionManagers: Array<{
            connection: { options: { type: string } }
            getRepository: jest.Mock
            query: jest.Mock
        }> = []
        const advisoryLockTails = new Map<string, Promise<void>>()
        const dataSource = {
            transaction: jest.fn(async (callback) => {
                let releaseLock: (() => void) | undefined
                const transactionManager = {
                    ...manager,
                    connection: { options: { type: 'postgres' } },
                    query: jest.fn(async (_query: string, parameters: string[]) => {
                        const lockKey = parameters.join(':')
                        const previousLock = advisoryLockTails.get(lockKey) ?? Promise.resolve()
                        let releaseCurrentLock = () => undefined
                        const currentLock = new Promise<void>((resolve) => {
                            releaseCurrentLock = resolve
                        })
                        advisoryLockTails.set(lockKey, currentLock)
                        releaseLock = () => {
                            releaseCurrentLock()
                            if (advisoryLockTails.get(lockKey) === currentLock) {
                                advisoryLockTails.delete(lockKey)
                            }
                        }
                        await previousLock
                    })
                }
                transactionManagers.push(transactionManager)
                try {
                    return await callback(transactionManager)
                } finally {
                    releaseLock?.()
                }
            })
        }

        return {
            dataSource,
            ledgers,
            ledgerRepository,
            memberships,
            membershipRepository,
            userRepository,
            planRepository,
            plans,
            periodRepository,
            periods,
            transactionManagers,
            userOrganizationRepository,
            service: createMembershipService(
                dataSource as never,
                planRepository as never,
                membershipRepository as never,
                ledgerRepository as never,
                {} as never,
                userRepository as never,
                userOrganizationRepository as never,
                undefined,
                featureOrganizationRepository as never,
                tenantSettingRepository as never,
                periodRepository as never
            )
        }
    }

    it('uses the tenant-wide tokens-per-point setting when saving plans', async () => {
        jest.spyOn(RequestContext, 'currentTenantId').mockReturnValue('tenant-1')
        jest.spyOn(RequestContext, 'getOrganizationId').mockReturnValue(null)
        const { plans, service } = createScopeInitializationHarness('100000')

        const firstPlan = await service.createPlan({ code: 'first', name: 'First', tokensPerPoint: 1000000 })
        await service.createPlan({ code: 'second', name: 'Second', tokensPerPoint: 100 })
        await service.updatePlan(firstPlan.id, { tokensPerPoint: 1000000 })

        expect(DEFAULT_MEMBERSHIP_TOKENS_PER_POINT).toBe(1000)
        expect(MEMBERSHIP_TOKENS_PER_POINT_OPTIONS).toEqual([1000, 10000, 100000, 1000000])
        expect(plans.map((plan) => plan.tokensPerPoint)).toEqual([100000])
    })

    it('deletes only archived plans that are not assigned to users', async () => {
        jest.spyOn(RequestContext, 'currentTenantId').mockReturnValue('tenant-1')
        jest.spyOn(RequestContext, 'getOrganizationId').mockReturnValue(null)
        const { memberships, plans, service } = createScopeInitializationHarness()

        const archivedPlan = await service.createPlan({
            code: 'archived',
            name: 'Archived',
            status: MembershipPlanStatusEnum.Archived
        })
        await service.deletePlan(archivedPlan.id)
        expect(plans).toHaveLength(0)

        const activePlan = await service.createPlan({ code: 'active', name: 'Active' })
        await expect(service.deletePlan(activePlan.id)).rejects.toThrow(
            'Archive the membership plan before deleting it.'
        )

        await service.archivePlan(activePlan.id)
        memberships.push(createMembership({ planId: activePlan.id }))
        await expect(service.deletePlan(activePlan.id)).rejects.toThrow(
            'This membership plan is still assigned to users and cannot be deleted.'
        )
        expect(plans).toHaveLength(1)
    })

    it('does not archive plans that are still assigned to users', async () => {
        jest.spyOn(RequestContext, 'currentTenantId').mockReturnValue('tenant-1')
        jest.spyOn(RequestContext, 'getOrganizationId').mockReturnValue(null)
        const { memberships, plans, service } = createScopeInitializationHarness()
        const activePlan = await service.createPlan({ code: 'assigned', name: 'Assigned' })
        memberships.push(createMembership({ planId: activePlan.id }))

        await expect(service.archivePlan(activePlan.id)).rejects.toThrow(
            'This membership plan is still assigned to users and cannot be archived.'
        )
        await expect(service.updatePlan(activePlan.id, { status: MembershipPlanStatusEnum.Archived })).rejects.toThrow(
            'This membership plan is still assigned to users and cannot be archived.'
        )
        expect(plans[0].status).toBe(MembershipPlanStatusEnum.Active)
    })

    it('synchronizes active assigned memberships when a plan allowance changes', async () => {
        jest.spyOn(RequestContext, 'currentTenantId').mockReturnValue('tenant-1')
        jest.spyOn(RequestContext, 'getOrganizationId').mockReturnValue(null)
        const { memberships, service } = createScopeInitializationHarness()
        const plan = await service.createPlan({ code: 'assigned', name: 'Assigned', includedPoints: 1000 })
        memberships.push(createMembership({ planId: plan.id, pointsGranted: 1000, pointsUsed: 100 }))

        await service.updatePlan(plan.id, { includedPoints: null })

        expect(memberships[0].pointsGranted).toBeNull()
    })

    it('does not allow an archived plan to remain the default plan', async () => {
        jest.spyOn(RequestContext, 'currentTenantId').mockReturnValue('tenant-1')
        jest.spyOn(RequestContext, 'getOrganizationId').mockReturnValue(null)
        const { plans, service } = createScopeInitializationHarness()

        await expect(
            service.createPlan({
                code: 'archived-default',
                name: 'Archived default',
                status: MembershipPlanStatusEnum.Archived,
                isDefault: true
            })
        ).rejects.toThrow('An archived membership plan cannot be the default plan.')

        const activePlan = await service.createPlan({ code: 'default', name: 'Default', isDefault: true })
        await expect(service.updatePlan(activePlan.id, { status: MembershipPlanStatusEnum.Archived })).rejects.toThrow(
            'An archived membership plan cannot be the default plan.'
        )
        expect(plans[0]).toMatchObject({ status: MembershipPlanStatusEnum.Active, isDefault: true })
    })

    it('normalizes allowed model rules when saving plans', async () => {
        jest.spyOn(RequestContext, 'currentTenantId').mockReturnValue('tenant-1')
        jest.spyOn(RequestContext, 'getOrganizationId').mockReturnValue(null)
        const { plans, service } = createScopeInitializationHarness()

        await service.createPlan({
            code: 'restricted-models',
            name: 'Restricted models',
            allowedModels: [{ provider: ' tongyi ', model: ' qwen3.6-plus ' }]
        })

        expect(plans[0].allowedModels).toEqual([{ provider: 'tongyi', model: 'qwen3.6-plus' }])
        await expect(
            service.createPlan({
                code: 'invalid-models',
                name: 'Invalid models',
                allowedModels: [{ provider: '', model: 'qwen3.6-plus' }]
            })
        ).rejects.toThrow('Allowed models must be an array of provider and model pairs.')
    })

    it('locks only membership rows when loading an active membership for update', async () => {
        const queryBuilder = {
            leftJoinAndSelect: jest.fn().mockReturnThis(),
            innerJoin: jest.fn().mockReturnThis(),
            where: jest.fn().mockReturnThis(),
            andWhere: jest.fn().mockReturnThis(),
            orderBy: jest.fn().mockReturnThis(),
            setLock: jest.fn().mockReturnThis(),
            getOne: jest.fn().mockResolvedValue(null)
        }
        const repository = {
            createQueryBuilder: jest.fn().mockReturnValue(queryBuilder)
        }
        const manager = {
            getRepository: jest.fn().mockReturnValue(repository)
        }
        const service = createMembershipService({} as never, {} as never, {} as never, {} as never, {} as never)

        await (
            service as unknown as { findActiveMembershipForUpdate: (...args: unknown[]) => Promise<unknown> }
        ).findActiveMembershipForUpdate('tenant-1', null, 'user-1', manager)

        expect(queryBuilder.leftJoinAndSelect).toHaveBeenCalledWith('membership.plan', 'plan')
        expect(queryBuilder.innerJoin).toHaveBeenCalledWith('membership.user', 'membershipUser')
        expect(queryBuilder.where).toHaveBeenCalledWith('membership.tenantId = :tenantId', { tenantId: 'tenant-1' })
        expect(queryBuilder.andWhere).toHaveBeenCalledWith('membership.userId = :userId', { userId: 'user-1' })
        expect(queryBuilder.andWhere).toHaveBeenCalledWith('membership.status = :status', {
            status: 'active'
        })
        expect(queryBuilder.andWhere).toHaveBeenCalledWith('membershipUser.type = :userType', {
            userType: UserType.USER
        })
        expect(queryBuilder.andWhere).toHaveBeenCalledWith('membership.organizationId IS NULL')
        expect(queryBuilder.setLock).toHaveBeenCalledTimes(1)
        expect(queryBuilder.setLock).toHaveBeenCalledWith('pessimistic_write', undefined, ['membership'])
    })

    it('selects the most recently updated active membership for user access', async () => {
        const queryBuilder = {
            leftJoinAndSelect: jest.fn().mockReturnThis(),
            innerJoin: jest.fn().mockReturnThis(),
            where: jest.fn().mockReturnThis(),
            andWhere: jest.fn().mockReturnThis(),
            orderBy: jest.fn().mockReturnThis(),
            getOne: jest.fn().mockResolvedValue(null)
        }
        const repository = {
            createQueryBuilder: jest.fn().mockReturnValue(queryBuilder)
        }
        const service = createMembershipService({} as never, {} as never, repository as never, {} as never, {} as never)

        await (
            service as unknown as { findActiveMembership: (...args: unknown[]) => Promise<unknown> }
        ).findActiveMembership('tenant-1', null, 'user-1')

        expect(queryBuilder.orderBy).toHaveBeenCalledWith('membership.updatedAt', 'DESC')
    })

    it('summarizes membership usage by hourly thread and model group', async () => {
        const queryBuilder = createQueryBuilder([
            {
                usageHour: '2026-06-30 14',
                provider: 'tongyi',
                model: 'qwen3.6-plus',
                organizationId: 'org-1',
                xpertId: 'xpert-1',
                threadId: 'thread-1',
                copilotId: 'copilot-1',
                conversationTitle: 'Quarterly Planning',
                xpertTitle: 'Research Assistant',
                xpertName: 'research-assistant',
                callCount: '9',
                pointsDelta: '-14',
                pointsUsed: '14',
                tokenUsed: '99087',
                firstUsedAt: new Date('2026-06-30T14:45:04.000Z'),
                lastUsedAt: new Date('2026-06-30T14:47:20.000Z'),
                total: '1'
            }
        ])
        const ledgerRepository = {
            createQueryBuilder: jest.fn().mockReturnValue(queryBuilder)
        }
        const service = createMembershipService(
            {} as never,
            {} as never,
            {} as never,
            ledgerRepository as never,
            {} as never
        )

        const result = await service.findUserUsageSummaries('tenant-1', 'user-1', undefined, { take: 20, skip: 0 })

        expect(result.total).toBe(1)
        expect(result.items[0]).toMatchObject({
            usageHour: '2026-06-30 14',
            provider: 'tongyi',
            model: 'qwen3.6-plus',
            organizationId: 'org-1',
            xpertId: 'xpert-1',
            threadId: 'thread-1',
            copilotId: 'copilot-1',
            conversationTitle: 'Quarterly Planning',
            xpertTitle: 'Research Assistant',
            xpertName: 'research-assistant',
            callCount: 9,
            pointsDelta: -14,
            pointsUsed: 14,
            tokenUsed: 99087,
            groupKey: {
                usageHour: '2026-06-30 14',
                provider: 'tongyi',
                model: 'qwen3.6-plus',
                organizationId: 'org-1',
                xpertId: 'xpert-1',
                threadId: 'thread-1',
                copilotId: 'copilot-1'
            }
        })
        expect(queryBuilder.andWhere).toHaveBeenCalledWith('ledger.source IN (:...usageSources)', {
            usageSources: [MembershipLedgerSourceEnum.Usage, MembershipLedgerSourceEnum.PersonalUsage]
        })
        expect(queryBuilder.addSelect).toHaveBeenCalledWith(
            'COUNT(ledger.id) FILTER (WHERE COALESCE(ledger.tokenUsed, 0) > 0)',
            'callCount'
        )
        expect(queryBuilder.leftJoin).toHaveBeenCalledWith(
            'chat_conversation',
            'conversation',
            '"conversation"."tenantId" = ledger."tenantId" AND "conversation"."threadId" = ledger."threadId"'
        )
        expect(queryBuilder.leftJoin).toHaveBeenCalledWith(
            'xpert',
            'usage_xpert',
            '"usage_xpert"."tenantId" = ledger."tenantId" AND "usage_xpert"."id"::text = ledger."xpertId"'
        )
        expect(queryBuilder.groupBy).toHaveBeenCalledWith('ledger.usageHour')
        expect(queryBuilder.addGroupBy).toHaveBeenCalledWith('ledger.provider')
        expect(queryBuilder.addGroupBy).toHaveBeenCalledWith('ledger.model')
        expect(queryBuilder.addGroupBy).toHaveBeenCalledWith('ledger.threadId')
        expect(queryBuilder.orderBy).toHaveBeenCalledWith('MAX(ledger.createdAt)', 'DESC')
    })

    it('summarizes all user usage without limiting the overview to the current membership scope', async () => {
        jest.spyOn(RequestContext, 'currentTenantId').mockReturnValue('tenant-1')
        jest.spyOn(RequestContext, 'getOrganizationId').mockReturnValue('org-1')
        jest.spyOn(RequestContext, 'currentUserId').mockReturnValue('owner-user')
        const queryBuilder = createQueryBuilder([
            {
                day: '2026-07-23T00:00:00.000Z',
                pointsUsed: '1',
                tokenUsed: '1000'
            }
        ])
        const ledgerRepository = {
            createQueryBuilder: jest.fn().mockReturnValue(queryBuilder)
        }
        const service = createMembershipService(
            {} as never,
            {} as never,
            {} as never,
            ledgerRepository as never,
            {} as never
        )
        const membership = createMembership({ organizationId: 'org-1' })
        jest.spyOn(service, 'findModelAccess').mockResolvedValue({
            tenantId: 'tenant-1',
            organizationId: 'org-1',
            membership
        })
        const internals = service as unknown as {
            getPersonalPointsBalance: () => Promise<number>
            findTopLedgerRanks: () => Promise<never[]>
        }
        jest.spyOn(internals, 'getPersonalPointsBalance').mockResolvedValue(10)
        jest.spyOn(internals, 'findTopLedgerRanks').mockResolvedValue([])

        const overview = await service.getOverview({
            start: '2026-07-01T00:00:00.000Z',
            end: '2026-07-31T23:59:59.999Z'
        })

        expect(overview?.buckets).toEqual([{ date: '2026-07-23', pointsUsed: 1, tokenUsed: 1000 }])
        expect(overview).toMatchObject({ totalTokens: 1000, peakDailyTokens: 1000, activeDays: 1 })
        expect(queryBuilder.andWhere).toHaveBeenCalledWith('ledger.source IN (:...usageSources)', {
            usageSources: [MembershipLedgerSourceEnum.Usage, MembershipLedgerSourceEnum.PersonalUsage]
        })
        expect(queryBuilder.andWhere).not.toHaveBeenCalledWith(
            '(ledger.membershipId = :membershipId OR (ledger.membershipId IS NULL AND ledger.source = :personalUsageSource))',
            expect.anything()
        )
        expect(queryBuilder.andWhere).not.toHaveBeenCalledWith('ledger.organizationId = :organizationId', {
            organizationId: 'org-1'
        })
    })

    it('lists the current user usage across membership scopes', async () => {
        jest.spyOn(RequestContext, 'currentTenantId').mockReturnValue('tenant-1')
        jest.spyOn(RequestContext, 'getOrganizationId').mockReturnValue('org-1')
        jest.spyOn(RequestContext, 'currentUserId').mockReturnValue('owner-user')
        const service = createMembershipService()
        const membership = createMembership({ organizationId: 'org-1' })
        jest.spyOn(service, 'findModelAccess').mockResolvedValue({
            tenantId: 'tenant-1',
            organizationId: 'org-1',
            membership
        })
        const usage = { items: [], total: 0 }
        const summaries = { items: [], total: 0 }
        jest.spyOn(service, 'findUserUsage').mockResolvedValue(usage)
        jest.spyOn(service, 'findUserUsageSummaries').mockResolvedValue(summaries)

        await expect(service.findMyUsage()).resolves.toBe(usage)
        await expect(service.findMyUsageSummaries()).resolves.toBe(summaries)

        expect(service.findUserUsage).toHaveBeenCalledWith('tenant-1', 'owner-user', undefined, undefined)
        expect(service.findUserUsageSummaries).toHaveBeenCalledWith('tenant-1', 'owner-user', undefined, undefined)
    })

    it('uses xpert and conversation titles in usage rankings with id fallback', async () => {
        const xpertQueryBuilder = createQueryBuilder([
            { key: 'xpert-1', label: '研究助手', pointsUsed: '2', tokenUsed: '2000' }
        ])
        const threadQueryBuilder = createQueryBuilder([
            { key: 'thread-deleted', label: null, pointsUsed: '1', tokenUsed: '1000' }
        ])
        const ledgerRepository = {
            createQueryBuilder: jest.fn().mockReturnValueOnce(xpertQueryBuilder).mockReturnValueOnce(threadQueryBuilder)
        }
        const service = createMembershipService(
            {} as never,
            {} as never,
            {} as never,
            ledgerRepository as never,
            {} as never
        )
        const findTopLedgerRanks = (
            service as unknown as {
                findTopLedgerRanks: (
                    tenantId: string,
                    userId: string,
                    dimension: 'model' | 'xpertId' | 'threadId',
                    query: undefined,
                    start: Date,
                    end: Date
                ) => Promise<Array<{ key?: string; label?: string }>>
            }
        ).findTopLedgerRanks.bind(service)
        const start = new Date('2026-07-01T00:00:00.000Z')
        const end = new Date('2026-07-31T23:59:59.999Z')

        await expect(findTopLedgerRanks('tenant-1', 'user-1', 'xpertId', undefined, start, end)).resolves.toMatchObject(
            [{ key: 'xpert-1', label: '研究助手' }]
        )
        await expect(
            findTopLedgerRanks('tenant-1', 'user-1', 'threadId', undefined, start, end)
        ).resolves.toMatchObject([{ key: 'thread-deleted', label: 'thread-deleted' }])

        expect(xpertQueryBuilder.leftJoin).toHaveBeenCalledWith(
            'xpert',
            'rank_xpert',
            '"rank_xpert"."tenantId" = ledger."tenantId" AND "rank_xpert"."id"::text = ledger."xpertId" AND "rank_xpert"."deletedAt" IS NULL'
        )
        expect(threadQueryBuilder.leftJoin).toHaveBeenCalledWith(
            'chat_conversation',
            'rank_conversation',
            '"rank_conversation"."tenantId" = ledger."tenantId" AND "rank_conversation"."threadId" = ledger."threadId"'
        )
    })

    it('lists plans in the current scope without creating a default plan', async () => {
        const planRepository = {
            find: jest.fn().mockResolvedValue([])
        }
        jest.spyOn(RequestContext, 'currentTenantId').mockReturnValue('tenant-1')
        jest.spyOn(RequestContext, 'getOrganizationId').mockReturnValue('org-1')
        const service = createMembershipService(
            {} as never,
            planRepository as never,
            {} as never,
            {} as never,
            {} as never
        )

        const plans = await service.findPlans()

        expect(plans).toEqual([])
        expect(planRepository.find).toHaveBeenCalledWith({
            where: {
                tenantId: 'tenant-1',
                organizationId: 'org-1'
            },
            order: { isDefault: 'DESC', createdAt: 'ASC' }
        })
    })

    it('treats missing membership plan feature toggles as disabled', async () => {
        const featureOrganizationRepository = createMembershipFeatureRepository(() => []).repository
        const service = createMembershipService(
            {} as never,
            {} as never,
            {} as never,
            {} as never,
            {} as never,
            undefined,
            undefined,
            undefined,
            featureOrganizationRepository as never
        )

        await expect(
            service.isMembershipPlanEnabled({
                tenantId: 'tenant-1',
                organizationId: null
            })
        ).resolves.toBe(false)
    })

    it('uses organization membership plan feature toggles before tenant toggles', async () => {
        const requestedScopes: Array<string | null> = []
        const featureOrganizationRepository = createMembershipFeatureRepository((organizationId) => {
            requestedScopes.push(organizationId)
            return organizationId === 'org-1' ? [{ isEnabled: false }] : [{ isEnabled: true }]
        }).repository
        const service = createMembershipService(
            {} as never,
            {} as never,
            {} as never,
            {} as never,
            {} as never,
            undefined,
            undefined,
            undefined,
            featureOrganizationRepository as never
        )

        await expect(
            service.isMembershipPlanEnabled({
                tenantId: 'tenant-1',
                organizationId: 'org-1'
            })
        ).resolves.toBe(false)
        expect(requestedScopes).toEqual(['org-1'])
    })

    it('falls back to the tenant membership plan feature toggle when organization toggle is missing', async () => {
        const requestedScopes: Array<string | null> = []
        const featureOrganizationRepository = createMembershipFeatureRepository((organizationId) => {
            requestedScopes.push(organizationId)
            return organizationId === 'org-1' ? [] : [{ isEnabled: true }]
        }).repository
        const service = createMembershipService(
            {} as never,
            {} as never,
            {} as never,
            {} as never,
            {} as never,
            undefined,
            undefined,
            undefined,
            featureOrganizationRepository as never
        )

        await expect(
            service.isMembershipPlanEnabled({
                tenantId: 'tenant-1',
                organizationId: 'org-1'
            })
        ).resolves.toBe(true)
        expect(requestedScopes).toEqual(['org-1', null])
    })

    it('rejects membership admin reads when membership plan feature is disabled', async () => {
        const planRepository = {
            find: jest.fn()
        }
        const featureOrganizationRepository = createMembershipFeatureRepository(() => [{ isEnabled: false }]).repository
        jest.spyOn(RequestContext, 'currentTenantId').mockReturnValue('tenant-1')
        jest.spyOn(RequestContext, 'getOrganizationId').mockReturnValue(null)
        const service = createMembershipService(
            {} as never,
            planRepository as never,
            {} as never,
            {} as never,
            {} as never,
            undefined,
            undefined,
            undefined,
            featureOrganizationRepository as never
        )

        await expect(service.findPlans()).rejects.toThrow('Membership plan feature is disabled.')
        expect(planRepository.find).not.toHaveBeenCalled()
    })

    it('allows model usage checks without membership access when membership plan feature is disabled', async () => {
        const featureOrganizationRepository = createMembershipFeatureRepository(() => [{ isEnabled: false }]).repository
        const service = createMembershipService(
            {} as never,
            {} as never,
            {} as never,
            {} as never,
            {} as never,
            undefined,
            undefined,
            undefined,
            featureOrganizationRepository as never
        )
        const findModelAccess = jest.spyOn(service, 'findModelAccess')

        await expect(
            service.assertCanUse({
                tenantId: 'tenant-1',
                organizationId: 'org-1',
                copilotOrganizationId: 'org-1',
                userId: 'assistant-tech-user',
                provider: 'tongyi',
                model: 'qwen3.6-plus'
            })
        ).resolves.toBeUndefined()
        expect(findModelAccess).not.toHaveBeenCalled()
    })

    it('does not record membership usage when membership plan feature is disabled', async () => {
        const dataSource = {
            transaction: jest.fn()
        }
        const featureOrganizationRepository = createMembershipFeatureRepository(() => [{ isEnabled: false }]).repository
        const service = createMembershipService(
            dataSource as never,
            {} as never,
            {} as never,
            {} as never,
            {} as never,
            undefined,
            undefined,
            undefined,
            featureOrganizationRepository as never
        )

        await expect(
            service.recordUsage({
                tenantId: 'tenant-1',
                organizationId: 'org-1',
                copilotOrganizationId: 'org-1',
                userId: 'assistant-tech-user',
                provider: 'tongyi',
                model: 'qwen3.6-plus',
                tokenUsed: 1000
            })
        ).resolves.toBeNull()
        expect(dataSource.transaction).not.toHaveBeenCalled()
    })

    it('returns no model access without resolving billable xpert users when membership plan feature is disabled', async () => {
        const xpertRepository = {
            findOne: jest.fn()
        }
        const featureOrganizationRepository = createMembershipFeatureRepository(() => [{ isEnabled: false }]).repository
        const service = createMembershipService(
            {} as never,
            {} as never,
            {} as never,
            {} as never,
            xpertRepository as never,
            undefined,
            undefined,
            undefined,
            featureOrganizationRepository as never
        )

        await expect(
            service.findModelAccess({
                tenantId: 'tenant-1',
                organizationId: 'org-1',
                userId: 'assistant-tech-user',
                xpertId: 'xpert-1'
            })
        ).resolves.toBeNull()
        expect(xpertRepository.findOne).not.toHaveBeenCalled()
    })

    it('does not auto-assign organization users when membership plan feature is disabled', async () => {
        const featureOrganizationRepository = createMembershipFeatureRepository(() => [{ isEnabled: false }]).repository
        const service = createMembershipService(
            {} as never,
            {} as never,
            {} as never,
            {} as never,
            {} as never,
            undefined,
            undefined,
            undefined,
            featureOrganizationRepository as never
        )
        const ensureScopeInitialized = jest.spyOn(service, 'ensureScopeInitialized')

        await expect(
            service.ensureUserAssignedIfScopeInitialized({
                tenantId: 'tenant-1',
                organizationId: 'org-1',
                userId: 'assistant-tech-user'
            })
        ).resolves.toBeNull()
        expect(ensureScopeInitialized).not.toHaveBeenCalled()
    })

    it('grants the tenant default membership idempotently without treating an organization membership as tenant-level', async () => {
        const { dataSource, ledgers, ledgerRepository, memberships, membershipRepository, plans, service } =
            createScopeInitializationHarness()
        plans.push(
            createPlan({
                id: 'plan-org-default',
                organizationId: 'org-1',
                code: 'org-default',
                name: 'Organization Default',
                includedPoints: 500
            }),
            createPlan({ id: 'plan-tenant-default' })
        )
        memberships.push(
            createMembership({
                id: 'membership-org',
                organizationId: 'org-1',
                userId: 'trial-user'
            })
        )

        const firstMembership = await service.ensureTenantDefaultMembership({
            tenantId: 'tenant-1',
            userId: 'trial-user'
        })
        const secondMembership = await service.ensureTenantDefaultMembership({
            tenantId: 'tenant-1',
            userId: 'trial-user'
        })

        expect(firstMembership).toMatchObject({
            organizationId: null,
            userId: 'trial-user',
            planId: 'plan-tenant-default',
            pointsGranted: 1000,
            pointsUsed: 0,
            pointsTotalUsed: 0,
            note: 'Default tenant plan grant'
        })
        expect(secondMembership?.id).toBe(firstMembership?.id)
        expect(memberships.filter((membership) => membership.organizationId == null)).toHaveLength(1)
        expect(dataSource.transaction).toHaveBeenCalledTimes(2)
        expect(membershipRepository.save).toHaveBeenCalledTimes(1)
        expect(ledgerRepository.save).toHaveBeenCalledTimes(1)
        expect(ledgers).toHaveLength(1)
        expect(ledgers[0]).toMatchObject({
            tenantId: 'tenant-1',
            organizationId: null,
            userId: 'trial-user',
            planId: 'plan-tenant-default',
            source: MembershipLedgerSourceEnum.Grant,
            pointsDelta: 1000,
            reason: 'Default tenant plan grant'
        })
    })

    it('does not grant or assign membership plans to technical users', async () => {
        jest.spyOn(RequestContext, 'currentTenantId').mockReturnValue('tenant-1')
        jest.spyOn(RequestContext, 'getOrganizationId').mockReturnValue(null)
        jest.spyOn(RequestContext, 'currentUserId').mockReturnValue('admin-1')
        const { dataSource, service, userRepository } = createScopeInitializationHarness()
        userRepository.findOne.mockResolvedValue(null)

        await expect(
            service.ensureTenantDefaultMembership({ tenantId: 'tenant-1', userId: 'technical-user' })
        ).resolves.toBeNull()
        await expect(
            service.assignUser('technical-user', {
                planId: 'plan-1'
            })
        ).rejects.toThrow('Technical users cannot have membership plans.')
        expect(dataSource.transaction).not.toHaveBeenCalled()
    })

    it('preserves point adjustments with up to three decimal places', async () => {
        jest.spyOn(RequestContext, 'currentTenantId').mockReturnValue('tenant-1')
        jest.spyOn(RequestContext, 'getOrganizationId').mockReturnValue(null)
        const { ledgers, service } = createScopeInitializationHarness()
        jest.spyOn(getMembershipServiceTestAccess(service), 'getPersonalPointsBalance').mockResolvedValue(0)

        await expect(service.adjustPersonalPoints('user-1', { pointDelta: 1.234 })).resolves.toEqual({
            userId: 'user-1',
            balance: 1.234
        })
        expect(ledgers).toContainEqual(
            expect.objectContaining({
                userId: 'user-1',
                source: MembershipLedgerSourceEnum.PersonalAdjustment,
                pointsDelta: 1.234
            })
        )
    })

    it('rejects point adjustments with more than three decimal places', async () => {
        jest.spyOn(RequestContext, 'currentTenantId').mockReturnValue('tenant-1')
        jest.spyOn(RequestContext, 'getOrganizationId').mockReturnValue(null)
        const { dataSource, service } = createScopeInitializationHarness()

        await expect(service.adjustPersonalPoints('user-1', { pointDelta: 1.2345 })).rejects.toThrow(
            'Point adjustment must be non-zero and use at most three decimal places.'
        )
        expect(dataSource.transaction).not.toHaveBeenCalled()
    })

    it('serializes concurrent tenant default membership grants for the same user', async () => {
        const { ledgerRepository, ledgers, memberships, membershipRepository, plans, service, transactionManagers } =
            createScopeInitializationHarness()
        plans.push(createPlan({ id: 'plan-tenant-default' }))

        const [firstMembership, secondMembership] = await Promise.all([
            service.ensureTenantDefaultMembership({ tenantId: 'tenant-1', userId: 'trial-user' }),
            service.ensureTenantDefaultMembership({ tenantId: 'tenant-1', userId: 'trial-user' })
        ])

        expect(firstMembership?.id).toBe(secondMembership?.id)
        expect(memberships.filter((membership) => membership.organizationId == null)).toHaveLength(1)
        expect(membershipRepository.save).toHaveBeenCalledTimes(1)
        expect(ledgerRepository.save).toHaveBeenCalledTimes(1)
        expect(ledgers).toHaveLength(1)
        expect(transactionManagers).toHaveLength(2)
        transactionManagers.forEach((transactionManager, index) => {
            expect(transactionManager.query).toHaveBeenCalledWith(
                'SELECT pg_advisory_xact_lock(hashtext($1), hashtext($2))',
                ['tenant-1', 'tenant-default-membership:trial-user']
            )
            expect(transactionManager.query.mock.invocationCallOrder[0]).toBeLessThan(
                membershipRepository.createQueryBuilder.mock.invocationCallOrder[index]
            )
        })
    })

    it('preserves an existing active tenant membership instead of replacing its plan', async () => {
        const { ledgerRepository, memberships, membershipRepository, plans, service } =
            createScopeInitializationHarness()
        plans.push(createPlan({ id: 'plan-tenant-default' }))
        const existingMembership = createMembership({
            id: 'membership-custom',
            organizationId: null,
            userId: 'trial-user',
            planId: 'plan-custom',
            pointsGranted: 250,
            plan: createPlan({
                id: 'plan-custom',
                code: 'custom',
                name: 'Custom',
                isDefault: false,
                includedPoints: 250
            })
        })
        memberships.push(existingMembership)

        const result = await service.ensureTenantDefaultMembership({
            tenantId: 'tenant-1',
            userId: 'trial-user'
        })

        expect(result).toBe(existingMembership)
        expect(result).toMatchObject({ planId: 'plan-custom', pointsGranted: 250 })
        expect(membershipRepository.save).not.toHaveBeenCalled()
        expect(ledgerRepository.save).not.toHaveBeenCalled()
    })

    it('does not regrant a tenant default membership after it was revoked', async () => {
        const { ledgerRepository, memberships, membershipRepository, plans, service } =
            createScopeInitializationHarness()
        plans.push(createPlan({ id: 'plan-tenant-default' }))
        memberships.push(
            createMembership({
                id: 'membership-revoked',
                organizationId: null,
                userId: 'trial-user',
                status: MembershipStatusEnum.Expired
            })
        )

        await expect(
            service.ensureTenantDefaultMembership({ tenantId: 'tenant-1', userId: 'trial-user' })
        ).resolves.toBeNull()
        expect(memberships).toHaveLength(1)
        expect(membershipRepository.save).not.toHaveBeenCalled()
        expect(ledgerRepository.save).not.toHaveBeenCalled()
    })

    it('does not create a membership when the tenant has no active default plan', async () => {
        const { ledgerRepository, membershipRepository, planRepository, plans, service } =
            createScopeInitializationHarness()
        plans.push(
            createPlan({
                id: 'plan-org-default',
                organizationId: 'org-1',
                code: 'org-default',
                name: 'Organization Default',
                includedPoints: 500
            }),
            createPlan({
                id: 'plan-tenant-custom',
                code: 'custom',
                name: 'Custom',
                isDefault: false,
                includedPoints: 250
            })
        )

        await expect(
            service.ensureTenantDefaultMembership({
                tenantId: 'tenant-1',
                userId: 'trial-user'
            })
        ).resolves.toBeNull()
        expect(planRepository.save).not.toHaveBeenCalled()
        expect(membershipRepository.save).not.toHaveBeenCalled()
        expect(ledgerRepository.save).not.toHaveBeenCalled()
    })

    it('uses organization membership before tenant membership for model access', async () => {
        const service = createMembershipService({} as never, {} as never, {} as never, {} as never, {} as never)
        const organizationMembership = createMembership({ organizationId: 'org-1' })
        const findUsableMembership = jest
            .spyOn(getMembershipServiceTestAccess(service), 'findUsableMembership')
            .mockResolvedValue(organizationMembership)

        const access = await service.findModelAccess({
            tenantId: 'tenant-1',
            organizationId: 'org-1',
            userId: 'assistant-tech-user'
        })

        expect(access).toMatchObject({
            tenantId: 'tenant-1',
            organizationId: 'org-1',
            membership: organizationMembership
        })
        expect(findUsableMembership).toHaveBeenCalledTimes(1)
        expect(findUsableMembership).toHaveBeenCalledWith('tenant-1', 'org-1', 'assistant-tech-user', undefined, false)
    })

    it('falls back to tenant membership for model access when organization membership is missing', async () => {
        const service = createMembershipService({} as never, {} as never, {} as never, {} as never, {} as never)
        const tenantMembership = createMembership({ organizationId: null })
        const findUsableMembership = jest
            .spyOn(getMembershipServiceTestAccess(service), 'findUsableMembership')
            .mockResolvedValueOnce(null)
            .mockResolvedValueOnce(tenantMembership)

        const access = await service.findModelAccess({
            tenantId: 'tenant-1',
            organizationId: 'org-1',
            userId: 'assistant-tech-user'
        })

        expect(access).toMatchObject({
            tenantId: 'tenant-1',
            organizationId: null,
            membership: tenantMembership
        })
        expect(findUsableMembership).toHaveBeenNthCalledWith(
            1,
            'tenant-1',
            'org-1',
            'assistant-tech-user',
            undefined,
            false
        )
        expect(findUsableMembership).toHaveBeenNthCalledWith(
            2,
            'tenant-1',
            null,
            'assistant-tech-user',
            undefined,
            false
        )
    })

    it('uses tenant membership when the organization membership feature is disabled', async () => {
        const { memberships, service } = createScopeInitializationHarness(undefined, (organizationId) =>
            organizationId === 'org-1' ? [{ isEnabled: false }] : [{ isEnabled: true }]
        )
        const tenantMembership = createMembership({ organizationId: null, userId: 'user-1' })
        memberships.push(tenantMembership)

        await expect(
            service.findModelAccess({
                tenantId: 'tenant-1',
                organizationId: 'org-1',
                userId: 'user-1'
            })
        ).resolves.toMatchObject({
            tenantId: 'tenant-1',
            organizationId: null,
            membership: tenantMembership
        })

        await expect(
            service.assertCanUse({
                tenantId: 'tenant-1',
                organizationId: 'org-1',
                copilotOrganizationId: null,
                userId: 'user-1',
                provider: 'tongyi',
                model: 'qwen3.6-plus'
            })
        ).resolves.toBeUndefined()
    })

    it('does not use assigned tenant membership when the tenant membership feature is disabled', async () => {
        const featureOrganizationRepository = createMembershipFeatureRepository((organizationId) =>
            organizationId === 'org-1' ? [{ isEnabled: true }] : [{ isEnabled: false }]
        ).repository
        const service = createMembershipService(
            {} as never,
            {} as never,
            {} as never,
            {} as never,
            {} as never,
            undefined,
            undefined,
            undefined,
            featureOrganizationRepository as never
        )
        const findUsableMembership = jest
            .spyOn(getMembershipServiceTestAccess(service), 'findUsableMembership')
            .mockResolvedValueOnce(null)
        jest.spyOn(getMembershipServiceTestAccess(service), 'hasActivePlan').mockResolvedValue(false)

        await expect(
            service.findModelAccess({
                tenantId: 'tenant-1',
                organizationId: 'org-1',
                userId: 'user-1'
            })
        ).resolves.toBeNull()

        expect(findUsableMembership).toHaveBeenCalledTimes(1)
        expect(findUsableMembership).toHaveBeenCalledWith('tenant-1', 'org-1', 'user-1', undefined, false)
    })

    it('does not fall back to tenant membership when organization has an active plan', async () => {
        const service = createMembershipService({} as never, {} as never, {} as never, {} as never, {} as never)
        const findUsableMembership = jest
            .spyOn(getMembershipServiceTestAccess(service), 'findUsableMembership')
            .mockResolvedValue(null)
        jest.spyOn(getMembershipServiceTestAccess(service), 'hasActivePlan').mockResolvedValue(true)
        jest.spyOn(getMembershipServiceTestAccess(service), 'getPersonalPointsBalance').mockResolvedValue(0)

        const access = await service.findModelAccess({
            tenantId: 'tenant-1',
            organizationId: 'org-1',
            userId: 'assistant-tech-user'
        })

        expect(access).toBeNull()
        expect(findUsableMembership).toHaveBeenCalledTimes(1)
        expect(findUsableMembership).toHaveBeenCalledWith('tenant-1', 'org-1', 'assistant-tech-user', undefined, false)
    })

    it('keeps organization initialization on tenant fallback when no active organization plan exists', async () => {
        const { dataSource, ledgerRepository, memberships, membershipRepository, planRepository, plans, service } =
            createScopeInitializationHarness()

        const status = await service.ensureScopeInitialized({
            tenantId: 'tenant-1',
            organizationId: 'org-1',
            assignedById: 'admin-1'
        })

        expect(status).toMatchObject({
            scope: 'organization',
            initialized: true,
            activeMemberCount: 2,
            assignedMemberCount: 0,
            activePlanCount: 0,
            defaultPlan: null
        })
        expect(plans).toHaveLength(0)
        expect(memberships).toHaveLength(0)
        expect(dataSource.transaction).not.toHaveBeenCalled()
        expect(planRepository.save).not.toHaveBeenCalled()
        expect(membershipRepository.save).not.toHaveBeenCalled()
        expect(ledgerRepository.save).not.toHaveBeenCalled()
    })

    it('does not reactivate an archived default organization plan during initialization', async () => {
        const { dataSource, ledgerRepository, memberships, membershipRepository, planRepository, plans, service } =
            createScopeInitializationHarness()
        plans.push({
            id: 'plan-archived',
            tenantId: 'tenant-1',
            organizationId: 'org-1',
            code: 'default-unlimited',
            name: 'Default Unlimited',
            status: MembershipPlanStatusEnum.Archived,
            isDefault: false,
            period: MembershipPeriodEnum.Monthly,
            includedPoints: null,
            tokensPerPoint: 1000,
            modelMultipliers: [],
            rateLimits: []
        } as MembershipPlan)

        const status = await service.ensureScopeInitialized({
            tenantId: 'tenant-1',
            organizationId: 'org-1',
            assignedById: 'admin-1'
        })

        expect(status).toMatchObject({
            scope: 'organization',
            initialized: true,
            activePlanCount: 0,
            defaultPlan: null
        })
        expect(plans).toHaveLength(1)
        expect(plans[0]).toMatchObject({
            code: 'default-unlimited',
            status: MembershipPlanStatusEnum.Archived,
            isDefault: false
        })
        expect(memberships).toHaveLength(0)
        expect(dataSource.transaction).not.toHaveBeenCalled()
        expect(planRepository.save).not.toHaveBeenCalled()
        expect(membershipRepository.save).not.toHaveBeenCalled()
        expect(ledgerRepository.save).not.toHaveBeenCalled()
    })

    it('initializes organization scope with an existing active plan and active member memberships idempotently', async () => {
        const { ledgerRepository, memberships, membershipRepository, planRepository, plans, service } =
            createScopeInitializationHarness()
        plans.push({
            id: 'plan-custom',
            tenantId: 'tenant-1',
            organizationId: 'org-1',
            code: 'custom',
            name: 'Custom',
            status: MembershipPlanStatusEnum.Active,
            isDefault: false,
            period: MembershipPeriodEnum.Monthly,
            includedPoints: 500,
            tokensPerPoint: 1000,
            modelMultipliers: [],
            rateLimits: []
        } as MembershipPlan)

        const firstStatus = await service.ensureScopeInitialized({
            tenantId: 'tenant-1',
            organizationId: 'org-1',
            assignedById: 'admin-1'
        })
        const secondStatus = await service.ensureScopeInitialized({
            tenantId: 'tenant-1',
            organizationId: 'org-1',
            assignedById: 'admin-1'
        })

        expect(firstStatus).toMatchObject({
            scope: 'organization',
            initialized: true,
            activeMemberCount: 2,
            assignedMemberCount: 2,
            activePlanCount: 1
        })
        expect(secondStatus).toMatchObject({
            initialized: true,
            activeMemberCount: 2,
            assignedMemberCount: 2
        })
        expect(plans).toHaveLength(1)
        expect(plans[0]).toMatchObject({
            code: 'custom',
            name: 'Custom',
            includedPoints: 500,
            tokensPerPoint: 1000,
            isDefault: true,
            status: MembershipPlanStatusEnum.Active
        })
        expect(memberships).toHaveLength(2)
        expect(membershipRepository.save).toHaveBeenCalledTimes(2)
        expect(ledgerRepository.save).toHaveBeenCalledTimes(2)
        expect(ledgerRepository.save).toHaveBeenCalledWith(expect.objectContaining({ pointsDelta: 500 }))
        expect(planRepository.save).toHaveBeenCalledTimes(1)
    })

    it('does not reactivate paused or revoked organization memberships during repair', async () => {
        const { ledgerRepository, memberships, membershipRepository, plans, service } =
            createScopeInitializationHarness()
        const plan = createPlan({
            id: 'plan-org-default',
            organizationId: 'org-1',
            isDefault: true
        })
        plans.push(plan)
        memberships.push(
            createMembership({
                id: 'membership-paused',
                organizationId: 'org-1',
                userId: 'user-1',
                status: MembershipStatusEnum.Paused,
                planId: plan.id,
                plan
            }),
            createMembership({
                id: 'membership-revoked',
                organizationId: 'org-1',
                userId: 'user-2',
                status: MembershipStatusEnum.Expired,
                planId: plan.id,
                plan
            })
        )

        const status = await service.ensureScopeInitialized({
            tenantId: 'tenant-1',
            organizationId: 'org-1',
            assignedById: 'admin-1'
        })

        expect(status).toMatchObject({ initialized: true, needsRepair: false, assignedMemberCount: 2 })
        expect(memberships.map((membership) => membership.status)).toEqual([
            MembershipStatusEnum.Paused,
            MembershipStatusEnum.Expired
        ])
        expect(membershipRepository.save).not.toHaveBeenCalled()
        expect(ledgerRepository.save).not.toHaveBeenCalled()
    })

    it('records xpert usage against the xpert creator membership', async () => {
        const xpertRepository = {
            findOne: jest.fn().mockResolvedValue({
                id: 'xpert-1',
                createdById: 'owner-user'
            })
        }
        const membershipRepository = {
            save: jest.fn().mockImplementation(async (membership) => membership)
        }
        const manager = {
            getRepository: jest.fn((entity) => {
                if (entity === Xpert) {
                    return xpertRepository
                }
                if (entity === UserMembership) {
                    return membershipRepository
                }
                return {}
            })
        }
        const dataSource = {
            transaction: jest.fn((callback) => callback(manager))
        }
        const service = createMembershipService(dataSource as never, {} as never, {} as never, {} as never, {} as never)
        const membership = createMembership()
        jest.spyOn(getMembershipServiceTestAccess(service), 'findUsableMembership').mockResolvedValue(membership)
        const createLedger = jest
            .spyOn(getMembershipServiceTestAccess(service), 'createLedger')
            .mockImplementation(async (_manager, input) => input as MembershipPointLedger)

        const ledger = await service.recordUsage({
            tenantId: 'tenant-1',
            organizationId: 'org-1',
            copilotOrganizationId: 'org-1',
            userId: 'assistant-tech-user',
            xpertId: 'xpert-1',
            threadId: 'thread-1',
            copilotId: 'copilot-1',
            provider: 'tongyi',
            model: 'qwen3.6-plus',
            tokenUsed: 2500
        })

        expect(xpertRepository.findOne).toHaveBeenCalledWith({
            where: {
                tenantId: 'tenant-1',
                id: 'xpert-1'
            },
            select: {
                id: true,
                createdById: true
            }
        })
        expect(getMembershipServiceTestAccess(service).findUsableMembership).toHaveBeenCalledWith(
            'tenant-1',
            'org-1',
            'owner-user',
            manager,
            true
        )
        expect(membershipRepository.save).toHaveBeenCalledWith(expect.objectContaining({ pointsUsed: 4.5 }))
        expect(createLedger).toHaveBeenCalledWith(
            manager,
            expect.objectContaining({
                tenantId: 'tenant-1',
                userId: 'owner-user',
                membershipId: 'membership-owner',
                planId: 'plan-1',
                source: 'usage',
                pointsDelta: -2.5,
                tokenUsed: 2500,
                organizationId: 'org-1',
                runtimeOrganizationId: 'org-1',
                xpertId: 'xpert-1',
                threadId: 'thread-1',
                copilotId: 'copilot-1'
            })
        )
        expect(ledger).toMatchObject({
            userId: 'owner-user',
            xpertId: 'xpert-1',
            threadId: 'thread-1',
            copilotId: 'copilot-1',
            tokenUsed: 2500
        })
    })

    it('uses the xpert creator when checking membership limits', async () => {
        const xpertRepository = {
            findOne: jest.fn().mockResolvedValue({
                id: 'xpert-1',
                createdById: 'owner-user'
            })
        }
        const service = createMembershipService(
            {} as never,
            {} as never,
            {} as never,
            {} as never,
            xpertRepository as never
        )
        const membership = createMembership({ pointsUsed: 0 })
        jest.spyOn(getMembershipServiceTestAccess(service), 'findUsableMembership').mockResolvedValue(membership)

        await service.assertCanUse({
            tenantId: 'tenant-1',
            userId: 'assistant-tech-user',
            xpertId: 'xpert-1',
            provider: 'tongyi',
            model: 'qwen3.6-plus'
        })

        expect(getMembershipServiceTestAccess(service).findUsableMembership).toHaveBeenCalledWith(
            'tenant-1',
            null,
            'owner-user',
            undefined,
            false
        )
    })

    it('falls back to the runtime user when xpert has no creator', async () => {
        const xpertRepository = {
            findOne: jest.fn().mockResolvedValue({
                id: 'xpert-1',
                createdById: null
            })
        }
        const service = createMembershipService(
            {} as never,
            {} as never,
            {} as never,
            {} as never,
            xpertRepository as never
        )
        const membership = createMembership({ userId: 'assistant-tech-user', pointsUsed: 0 })
        jest.spyOn(getMembershipServiceTestAccess(service), 'findUsableMembership').mockResolvedValue(membership)

        await service.assertCanUse({
            tenantId: 'tenant-1',
            userId: 'assistant-tech-user',
            xpertId: 'xpert-1'
        })

        expect(getMembershipServiceTestAccess(service).findUsableMembership).toHaveBeenCalledWith(
            'tenant-1',
            null,
            'assistant-tech-user',
            undefined,
            false
        )
    })

    it('keeps non-xpert usage on the runtime user', async () => {
        const xpertRepository = {
            findOne: jest.fn()
        }
        const membershipRepository = {
            save: jest.fn().mockImplementation(async (membership) => membership)
        }
        const manager = {
            connection: { options: { type: 'sqlite' } },
            getRepository: jest.fn((entity) => {
                if (entity === UserMembership) {
                    return membershipRepository
                }
                return {}
            })
        }
        const dataSource = {
            transaction: jest.fn((callback) => callback(manager))
        }
        const service = createMembershipService(
            dataSource as never,
            {} as never,
            {} as never,
            {} as never,
            xpertRepository as never
        )
        const membership = createMembership({ userId: 'assistant-tech-user' })
        jest.spyOn(getMembershipServiceTestAccess(service), 'findUsableMembership').mockResolvedValue(membership)
        const createLedger = jest
            .spyOn(getMembershipServiceTestAccess(service), 'createLedger')
            .mockImplementation(async (_manager, input) => input as MembershipPointLedger)

        await service.recordUsage({
            tenantId: 'tenant-1',
            userId: 'assistant-tech-user',
            provider: 'tongyi',
            model: 'qwen3.6-plus',
            tokenUsed: 1000
        })

        expect(xpertRepository.findOne).not.toHaveBeenCalled()
        expect(getMembershipServiceTestAccess(service).findUsableMembership).toHaveBeenCalledWith(
            'tenant-1',
            null,
            'assistant-tech-user',
            manager,
            true
        )
        expect(createLedger).toHaveBeenCalledWith(
            manager,
            expect.objectContaining({
                userId: 'assistant-tech-user',
                tokenUsed: 1000
            })
        )
    })

    it('rejects usage without recording membership ledger when no membership is assigned', async () => {
        const membershipRepository = {
            save: jest.fn()
        }
        const manager = {
            connection: { options: { type: 'sqlite' } },
            getRepository: jest.fn((entity) => {
                if (entity === UserMembership) {
                    return membershipRepository
                }
                return {}
            })
        }
        const dataSource = {
            transaction: jest.fn((callback) => callback(manager))
        }
        const service = createMembershipService(dataSource as never, {} as never, {} as never, {} as never, {} as never)
        jest.spyOn(getMembershipServiceTestAccess(service), 'findUsableMembership').mockResolvedValue(null)
        jest.spyOn(getMembershipServiceTestAccess(service), 'getPersonalPointsBalance').mockResolvedValue(0)
        const createLedger = jest.spyOn(getMembershipServiceTestAccess(service), 'createLedger')

        await expect(
            service.recordUsage({
                tenantId: 'tenant-1',
                organizationId: null,
                userId: 'assistant-tech-user',
                provider: 'tongyi',
                model: 'qwen3.6-plus',
                tokenUsed: 1000
            })
        ).rejects.toThrow('Membership plan is required to use Copilot models.')

        expect(membershipRepository.save).not.toHaveBeenCalled()
        expect(createLedger).not.toHaveBeenCalled()
    })

    it('rejects membership checks when no membership is assigned', async () => {
        const service = createMembershipService({} as never, {} as never, {} as never, {} as never, {} as never)
        jest.spyOn(getMembershipServiceTestAccess(service), 'findUsableMembership').mockResolvedValue(null)
        jest.spyOn(getMembershipServiceTestAccess(service), 'getPersonalPointsBalance').mockResolvedValue(0)

        await expect(
            service.assertCanUse({
                tenantId: 'tenant-1',
                organizationId: null,
                copilotOrganizationId: null,
                userId: 'assistant-tech-user',
                provider: 'tongyi',
                model: 'qwen3.6-plus'
            })
        ).rejects.toThrow('Membership plan is required to use Copilot models.')

        expect(getMembershipServiceTestAccess(service).findUsableMembership).toHaveBeenCalledWith(
            'tenant-1',
            null,
            'assistant-tech-user',
            undefined,
            false
        )
    })

    it('self-heals organization membership when checking a local copilot without an organization plan', async () => {
        const service = createMembershipService({} as never, {} as never, {} as never, {} as never, {} as never)
        const organizationMembership = createMembership({ organizationId: 'org-1', pointsUsed: 0 })
        jest.spyOn(service, 'findModelAccess')
            .mockResolvedValueOnce({
                tenantId: 'tenant-1',
                organizationId: null,
                membership: createMembership({ organizationId: null, pointsUsed: 0 })
            })
            .mockResolvedValueOnce({
                tenantId: 'tenant-1',
                organizationId: 'org-1',
                membership: organizationMembership
            })
        const ensureScopeInitialized = jest.spyOn(service, 'ensureScopeInitialized').mockResolvedValue({
            tenantId: 'tenant-1',
            organizationId: 'org-1',
            scope: 'organization',
            planCount: 1,
            activePlanCount: 1,
            initialized: true,
            needsRepair: false
        })
        const assertRateLimits = jest
            .spyOn(getMembershipServiceTestAccess(service), 'assertRateLimits')
            .mockResolvedValue(undefined)

        await service.assertCanUse({
            tenantId: 'tenant-1',
            organizationId: 'org-1',
            copilotOrganizationId: 'org-1',
            userId: 'assistant-tech-user',
            provider: 'tongyi',
            model: 'qwen3.6-plus'
        })

        expect(ensureScopeInitialized).toHaveBeenCalledWith(
            {
                tenantId: 'tenant-1',
                organizationId: 'org-1',
                assignedById: 'assistant-tech-user'
            },
            undefined
        )
        expect(assertRateLimits).toHaveBeenCalledWith(organizationMembership, 'tongyi', 'qwen3.6-plus')
    })

    it('rejects copilot models outside the active membership scope', async () => {
        const service = createMembershipService({} as never, {} as never, {} as never, {} as never, {} as never)
        jest.spyOn(service, 'findModelAccess').mockResolvedValue({
            tenantId: 'tenant-1',
            organizationId: 'org-1',
            membership: createMembership({ organizationId: 'org-1', pointsUsed: 0 })
        })

        await expect(
            service.assertCanUse({
                tenantId: 'tenant-1',
                organizationId: 'org-1',
                copilotOrganizationId: null,
                userId: 'assistant-tech-user',
                provider: 'tongyi',
                model: 'qwen3.6-plus'
            })
        ).rejects.toThrow('Copilot model is not available for the current membership plan.')
    })

    it('rejects models not explicitly allowed by the active membership plan', async () => {
        const service = createMembershipService({} as never, {} as never, {} as never, {} as never, {} as never)
        jest.spyOn(service, 'findModelAccess').mockResolvedValue({
            tenantId: 'tenant-1',
            organizationId: null,
            membership: createMembership({
                organizationId: null,
                pointsUsed: 0,
                plan: {
                    ...createMembership().plan,
                    allowedModels: [{ provider: 'tongyi', model: 'qwen3.6-plus' }]
                }
            } as never)
        })

        await expect(
            service.assertCanUse({
                tenantId: 'tenant-1',
                organizationId: null,
                copilotOrganizationId: null,
                userId: 'assistant-tech-user',
                provider: 'tongyi',
                model: 'qwen-max'
            })
        ).rejects.toThrow('Copilot model is not available for the current membership plan.')
    })

    it('translates copilot model membership scope errors', async () => {
        const previousLanguage = i18next.language
        if (!i18next.isInitialized) {
            await i18next.init({
                lng: 'zh-Hans',
                fallbackLng: 'en',
                ns: ['server-ai'],
                defaultNS: 'server-ai',
                resources: {
                    'zh-Hans': {
                        'server-ai': {
                            Error: {
                                CopilotModelUnavailableForMembershipPlan: '当前会员计划无法使用该 Copilot 模型。'
                            }
                        }
                    }
                }
            })
        } else {
            i18next.addResourceBundle(
                'zh-Hans',
                'server-ai',
                {
                    Error: {
                        CopilotModelUnavailableForMembershipPlan: '当前会员计划无法使用该 Copilot 模型。'
                    }
                },
                true,
                true
            )
            await i18next.changeLanguage('zh-Hans')
        }

        const service = createMembershipService({} as never, {} as never, {} as never, {} as never, {} as never)
        jest.spyOn(service, 'findModelAccess').mockResolvedValue({
            tenantId: 'tenant-1',
            organizationId: 'org-1',
            membership: createMembership({ organizationId: 'org-1', pointsUsed: 0 })
        })

        try {
            await expect(
                service.assertCanUse({
                    tenantId: 'tenant-1',
                    organizationId: 'org-1',
                    copilotOrganizationId: null,
                    userId: 'assistant-tech-user',
                    provider: 'tongyi',
                    model: 'qwen3.6-plus'
                })
            ).rejects.toThrow('当前会员计划无法使用该 Copilot 模型。')
        } finally {
            await i18next.changeLanguage(previousLanguage ?? 'en')
        }
    })

    it('repairs a stale finite allowance when the assigned plan is unlimited', async () => {
        const membershipRepository = {
            save: jest.fn().mockImplementation(async (membership) => membership)
        }
        const service = createMembershipService(
            {} as never,
            {} as never,
            membershipRepository as never,
            {} as never,
            {} as never
        )
        const membership = createMembership({
            pointsGranted: 0,
            plan: {
                ...createMembership().plan,
                includedPoints: null
            }
        })
        const internals = service as unknown as {
            findActiveMembership: () => Promise<ReturnType<typeof createMembership>>
            createLedger: () => Promise<MembershipPointLedger>
        }
        jest.spyOn(internals, 'findActiveMembership').mockResolvedValue(membership)
        jest.spyOn(internals, 'createLedger').mockResolvedValue(new MembershipPointLedger())

        const access = await service.findModelAccess({
            tenantId: 'tenant-1',
            organizationId: null,
            userId: membership.userId
        })

        expect(access?.membership.pointsGranted).toBeNull()
        expect(membershipRepository.save).toHaveBeenCalledWith(expect.objectContaining({ pointsGranted: null }))
    })

    it('records usage with the tenant-wide conversion for unlimited memberships', async () => {
        const membershipRepository = {
            save: jest.fn().mockImplementation(async (membership) => membership)
        }
        const manager = {
            getRepository: jest.fn((entity) => {
                if (entity === UserMembership) {
                    return membershipRepository
                }
                return {}
            })
        }
        const dataSource = {
            transaction: jest.fn((callback) => callback(manager))
        }
        const tenantSettingRepository = {
            findOne: jest.fn().mockResolvedValue({
                tenantId: 'tenant-1',
                name: MEMBERSHIP_TOKENS_PER_POINT_SETTING,
                value: '10000'
            })
        }
        const service = createMembershipService(
            dataSource as never,
            {} as never,
            {} as never,
            {} as never,
            {} as never,
            undefined,
            undefined,
            undefined,
            undefined,
            tenantSettingRepository as never
        )
        const membership = createMembership({
            organizationId: 'org-1',
            pointsGranted: null,
            pointsUsed: 99,
            plan: {
                ...createMembership().plan,
                includedPoints: null
            }
        } as never)
        jest.spyOn(service, 'findModelAccess').mockResolvedValue({
            tenantId: 'tenant-1',
            organizationId: 'org-1',
            membership
        })
        const createLedger = jest
            .spyOn(getMembershipServiceTestAccess(service), 'createLedger')
            .mockImplementation(async (_manager, input) => input as MembershipPointLedger)

        const ledger = await service.recordUsage({
            tenantId: 'tenant-1',
            organizationId: 'org-1',
            copilotOrganizationId: 'org-1',
            userId: 'assistant-tech-user',
            provider: 'tongyi',
            model: 'qwen3.6-plus',
            tokenUsed: 2500
        })

        expect(membershipRepository.save).toHaveBeenCalledWith(expect.objectContaining({ pointsUsed: 99.25 }))
        expect(createLedger).toHaveBeenCalledWith(
            manager,
            expect.objectContaining({
                pointsDelta: -0.25,
                tokenUsed: 2500,
                organizationId: 'org-1'
            })
        )
        expect(ledger).toMatchObject({ pointsDelta: -0.25, tokenUsed: 2500 })
    })

    it('consumes membership points before personal points', async () => {
        const membershipRepository = {
            save: jest.fn().mockImplementation(async (membership) => membership)
        }
        const manager = {
            connection: { options: { type: 'sqlite' } },
            getRepository: jest.fn((entity) => {
                if (entity === UserMembership) {
                    return membershipRepository
                }
                return {}
            })
        }
        const dataSource = {
            transaction: jest.fn((callback) => callback(manager))
        }
        const service = createMembershipService(dataSource as never, {} as never, {} as never, {} as never, {} as never)
        const membership = createMembership({ pointsGranted: 10, pointsUsed: 9.5 })
        jest.spyOn(service, 'findModelAccess').mockResolvedValue({
            tenantId: 'tenant-1',
            organizationId: null,
            membership
        })
        jest.spyOn(getMembershipServiceTestAccess(service), 'getPersonalPointsBalance').mockResolvedValue(5)
        const createLedger = jest
            .spyOn(getMembershipServiceTestAccess(service), 'createLedger')
            .mockImplementation(async (_manager, input) => input as MembershipPointLedger)

        await service.recordUsage({
            tenantId: 'tenant-1',
            userId: membership.userId,
            provider: 'tongyi',
            model: 'qwen3.6-plus',
            tokenUsed: 1000
        })

        expect(membershipRepository.save).toHaveBeenCalledWith(expect.objectContaining({ pointsUsed: 10 }))
        expect(createLedger).toHaveBeenNthCalledWith(
            1,
            manager,
            expect.objectContaining({
                membershipId: membership.id,
                source: MembershipLedgerSourceEnum.Usage,
                pointsDelta: -0.5,
                tokenUsed: 1000
            })
        )
        expect(createLedger).toHaveBeenNthCalledWith(
            2,
            manager,
            expect.objectContaining({
                membershipId: null,
                source: MembershipLedgerSourceEnum.PersonalUsage,
                pointsDelta: -0.5,
                tokenUsed: 0
            })
        )
    })

    it('uses personal points with the default plan after a manual membership expires', async () => {
        const membershipRepository = {
            save: jest.fn().mockImplementation(async (membership) => membership)
        }
        const defaultPlan = createPlan({
            id: 'plan-free',
            code: 'free',
            name: 'Free',
            includedPoints: 100
        })
        const planRepository = {
            findOne: jest.fn().mockResolvedValue(defaultPlan)
        }
        const service = createMembershipService(
            {} as never,
            planRepository as never,
            membershipRepository as never,
            {} as never,
            {} as never
        )
        const membership = createMembership({
            renewalMode: MembershipRenewalModeEnum.Manual,
            currentPeriodEnd: new Date('2020-01-01T00:00:00.000Z')
        })
        jest.spyOn(getMembershipServiceTestAccess(service), 'findActiveMembership').mockResolvedValue(membership)
        jest.spyOn(getMembershipServiceTestAccess(service), 'findMembershipForUpdate').mockResolvedValue(membership)
        jest.spyOn(getMembershipServiceTestAccess(service), 'getPersonalPointsBalance').mockResolvedValue(10)
        const renewMembership = jest.spyOn(getMembershipServiceTestAccess(service), 'renewMembership')
        jest.spyOn(getMembershipServiceTestAccess(service), 'createMembershipStatusLedger').mockResolvedValue(undefined)

        const access = await service.findModelAccess({
            tenantId: 'tenant-1',
            organizationId: null,
            userId: membership.userId
        })

        expect(access).toMatchObject({
            tenantId: 'tenant-1',
            organizationId: null,
            personalPointsOnly: true,
            persistedMembership: membership,
            membership: {
                planId: 'plan-free',
                plan: defaultPlan,
                pointsGranted: 0,
                pointsUsed: 0
            }
        })
        expect(membership.status).toBe(MembershipStatusEnum.Expired)
        expect(membership.planId).toBe('plan-1')
        expect(membership.pointsGranted).toBe(100)
        expect(membershipRepository.save).toHaveBeenCalledWith(membership)
        expect(renewMembership).not.toHaveBeenCalled()
    })

    it('uses personal points with the default plan even without membership history', async () => {
        const defaultPlan = createPlan({ id: 'plan-free', code: 'free', name: 'Free' })
        const membershipRepository = {
            create: jest.fn((input) => ({ ...input }))
        }
        const service = createMembershipService(
            {} as never,
            { findOne: jest.fn().mockResolvedValue(defaultPlan) } as never,
            membershipRepository as never,
            {} as never,
            {} as never
        )
        const internals = service as unknown as {
            findActiveMembership: () => Promise<null>
            findMembershipForUpdate: () => Promise<null>
            getPersonalPointsBalance: () => Promise<number>
        }
        jest.spyOn(internals, 'findActiveMembership').mockResolvedValue(null)
        jest.spyOn(internals, 'findMembershipForUpdate').mockResolvedValue(null)
        jest.spyOn(internals, 'getPersonalPointsBalance').mockResolvedValue(10)

        const access = await service.findModelAccess({
            tenantId: 'tenant-1',
            organizationId: null,
            userId: 'owner-user'
        })

        expect(access).toMatchObject({
            personalPointsOnly: true,
            membership: {
                userId: 'owner-user',
                planId: 'plan-free',
                pointsGranted: 0,
                pointsUsed: 0
            }
        })
        expect(access?.persistedMembership).toBeUndefined()
    })

    it('returns an expired membership with zero personal points and falls back when its plan was deleted', async () => {
        jest.spyOn(RequestContext, 'currentTenantId').mockReturnValue('tenant-1')
        jest.spyOn(RequestContext, 'getOrganizationId').mockReturnValue(null)
        jest.spyOn(RequestContext, 'currentUserId').mockReturnValue('owner-user')
        const fallbackPlan = createPlan({ id: 'plan-free', code: 'free', name: 'Free' })
        const expiredMembership = createMembership({
            planId: null,
            plan: undefined,
            status: MembershipStatusEnum.Expired
        })
        const service = createMembershipService({} as never, {} as never, {} as never, {} as never, {} as never)
        jest.spyOn(service, 'findModelAccess').mockResolvedValue(null)
        const internals = service as unknown as {
            findMembershipForUpdate: () => Promise<UserMembership>
            findDefaultPlan: () => Promise<MembershipPlan>
            getPersonalPointsBalance: () => Promise<number>
        }
        jest.spyOn(internals, 'findMembershipForUpdate').mockResolvedValue(expiredMembership)
        jest.spyOn(internals, 'findDefaultPlan').mockResolvedValue(fallbackPlan)
        jest.spyOn(internals, 'getPersonalPointsBalance').mockResolvedValue(0)

        const me = await service.getMe()

        expect(me).toMatchObject({
            membership: {
                status: MembershipStatusEnum.Expired,
                planId: 'plan-free',
                plan: fallbackPlan
            },
            plan: fallbackPlan,
            personalPointsBalance: 0
        })
    })

    it('returns the persisted expired membership and personal balance for display', async () => {
        jest.spyOn(RequestContext, 'currentTenantId').mockReturnValue('tenant-1')
        jest.spyOn(RequestContext, 'getOrganizationId').mockReturnValue(null)
        jest.spyOn(RequestContext, 'currentUserId').mockReturnValue('owner-user')
        const service = createMembershipService({} as never, {} as never, {} as never, {} as never, {} as never)
        const expiredMembership = createMembership({
            status: MembershipStatusEnum.Expired,
            pointsGranted: 100,
            pointsUsed: 0
        })
        const accessMembership = createMembership({
            status: MembershipStatusEnum.Active,
            pointsGranted: 0,
            pointsUsed: 0
        })
        jest.spyOn(service, 'findModelAccess').mockResolvedValue({
            tenantId: 'tenant-1',
            organizationId: null,
            membership: accessMembership,
            persistedMembership: expiredMembership,
            personalPointsOnly: true
        })
        const internals = service as unknown as {
            getPersonalPointsBalance: (tenantId: string, userId: string) => Promise<number>
        }
        jest.spyOn(internals, 'getPersonalPointsBalance').mockResolvedValue(10.673)

        const me = await service.getMe()

        expect(me).toMatchObject({
            membership: expiredMembership,
            plan: expiredMembership.plan,
            personalPointsOnly: true,
            pointsGranted: 100,
            pointsUsed: 0,
            pointsRemaining: 100,
            personalPointsBalance: 10.673
        })
    })

    it('records personal-only usage without consuming expired membership points', async () => {
        const membershipRepository = {
            save: jest.fn()
        }
        const manager = {
            connection: { options: { type: 'sqlite' } },
            getRepository: jest.fn((entity) => (entity === UserMembership ? membershipRepository : {}))
        }
        const dataSource = {
            transaction: jest.fn((callback) => callback(manager))
        }
        const service = createMembershipService(dataSource as never, {} as never, {} as never, {} as never, {} as never)
        const membership = createMembership({
            planId: 'plan-free',
            pointsGranted: 0,
            pointsUsed: 0,
            plan: {
                ...createMembership().plan,
                id: 'plan-free',
                code: 'free',
                name: 'Free',
                includedPoints: 100
            }
        } as never)
        jest.spyOn(service, 'findModelAccess').mockResolvedValue({
            tenantId: 'tenant-1',
            organizationId: null,
            membership,
            personalPointsOnly: true
        })
        jest.spyOn(getMembershipServiceTestAccess(service), 'getPersonalPointsBalance').mockResolvedValue(10)
        const createLedger = jest
            .spyOn(getMembershipServiceTestAccess(service), 'createLedger')
            .mockImplementation(async (_manager, input) => input as MembershipPointLedger)

        await service.recordUsage({
            tenantId: 'tenant-1',
            userId: membership.userId,
            provider: 'tongyi',
            model: 'qwen3.6-plus',
            tokenUsed: 1000
        })

        expect(membershipRepository.save).not.toHaveBeenCalled()
        expect(createLedger).toHaveBeenCalledTimes(1)
        expect(createLedger).toHaveBeenCalledWith(
            manager,
            expect.objectContaining({
                membershipId: null,
                planId: 'plan-free',
                source: MembershipLedgerSourceEnum.PersonalUsage,
                pointsDelta: -1,
                tokenUsed: 1000
            })
        )
    })

    it('pauses and revokes a managed membership without replacing it', async () => {
        jest.spyOn(RequestContext, 'currentTenantId').mockReturnValue('tenant-1')
        jest.spyOn(RequestContext, 'getOrganizationId').mockReturnValue(null)
        const membershipRepository = {
            save: jest.fn().mockImplementation(async (membership) => membership)
        }
        const manager = {
            getRepository: jest.fn((entity) => (entity === UserMembership ? membershipRepository : {}))
        }
        const dataSource = {
            transaction: jest.fn((callback) => callback(manager))
        }
        const service = createMembershipService(
            dataSource as never,
            {} as never,
            membershipRepository as never,
            {} as never,
            {} as never
        )
        const membership = createMembership()
        jest.spyOn(getMembershipServiceTestAccess(service), 'requireManagedMembership').mockResolvedValue(membership)
        jest.spyOn(getMembershipServiceTestAccess(service), 'createMembershipStatusLedger').mockResolvedValue(undefined)
        jest.spyOn(getMembershipServiceTestAccess(service), 'findMembershipById').mockImplementation(
            async () => membership
        )

        const paused = await service.pauseUser(membership.userId)
        expect(paused.status).toBe(MembershipStatusEnum.Paused)
        expect(paused.id).toBe(membership.id)

        const revoked = await service.revokeUser(membership.userId)
        expect(revoked.status).toBe(MembershipStatusEnum.Expired)
        expect(revoked.id).toBe(membership.id)
        expect(revoked.currentPeriodEnd.getTime()).toBeLessThanOrEqual(Date.now())
    })

    it('expires an organization membership when the user is removed from that organization', async () => {
        const membershipRepository = {
            save: jest.fn().mockImplementation(async (membership) => membership)
        }
        const manager = {
            connection: { options: { type: 'sqlite' } },
            getRepository: jest.fn((entity) => (entity === UserMembership ? membershipRepository : {}))
        }
        const dataSource = {
            transaction: jest.fn((callback) => callback(manager))
        }
        const service = createMembershipService(
            dataSource as never,
            {} as never,
            membershipRepository as never,
            {} as never,
            {} as never
        )
        const membership = createMembership({
            organizationId: 'org-1',
            userId: 'user-1'
        })
        jest.spyOn(getMembershipServiceTestAccess(service), 'findMembershipForUpdate').mockResolvedValue(membership)
        const createStatusLedger = jest
            .spyOn(getMembershipServiceTestAccess(service), 'createMembershipStatusLedger')
            .mockResolvedValue(undefined)

        const revoked = await service.revokeOrganizationMembershipForRemovedUser({
            tenantId: 'tenant-1',
            organizationId: 'org-1',
            userId: 'user-1'
        })

        expect(revoked).toMatchObject({
            id: membership.id,
            status: MembershipStatusEnum.Expired
        })
        expect(membershipRepository.save).toHaveBeenCalledWith(membership)
        expect(createStatusLedger).toHaveBeenCalledWith(manager, membership, 'Organization membership removed')
        expect(membership.currentPeriodEnd.getTime()).toBeLessThanOrEqual(Date.now())
    })

    it('keeps paid future periods without blocking organization membership removal', async () => {
        const { memberships, periods, plans, service } = createScopeInitializationHarness()
        const plan = createPlan({ id: 'plan-paid-org', organizationId: 'org-1' })
        plans.push(plan)
        memberships.push(
            createMembership({
                id: 'membership-paid-org',
                organizationId: 'org-1',
                userId: 'user-1',
                planId: plan.id,
                plan,
                currentPeriodStart: new Date('2030-07-01T00:00:00.000Z'),
                currentPeriodEnd: new Date('2030-08-01T00:00:00.000Z')
            })
        )

        await service.appendMembershipPeriods({
            tenantId: 'tenant-1',
            organizationId: 'org-1',
            userId: 'user-1',
            planId: plan.id,
            count: 1,
            source: MembershipSourceEnum.Admin
        })
        await service.appendMembershipPeriods({
            tenantId: 'tenant-1',
            organizationId: 'org-1',
            userId: 'user-1',
            planId: plan.id,
            count: 1,
            source: MembershipSourceEnum.External,
            sourceReference: 'paid-org-period'
        })

        const revoked = await service.revokeOrganizationMembershipForRemovedUser({
            tenantId: 'tenant-1',
            organizationId: 'org-1',
            userId: 'user-1'
        })

        expect(revoked?.status).toBe(MembershipStatusEnum.Expired)
        expect(
            periods.find(
                (period) =>
                    period.source === MembershipSourceEnum.Admin &&
                    period.status === MembershipPeriodStatusEnum.Cancelled
            )
        ).toBeDefined()
        expect(
            periods.find(
                (period) =>
                    period.source === MembershipSourceEnum.External && period.sourceReference === 'paid-org-period'
            )
        ).toMatchObject({ status: MembershipPeriodStatusEnum.Scheduled })
    })

    it('reuses a paused membership record when assigning a new plan', async () => {
        jest.spyOn(RequestContext, 'currentTenantId').mockReturnValue('tenant-1')
        jest.spyOn(RequestContext, 'getOrganizationId').mockReturnValue(null)
        jest.spyOn(RequestContext, 'currentUserId').mockReturnValue('admin-1')
        const { memberships, plans, service } = createScopeInitializationHarness()
        const plan = createPlan({ id: 'plan-target' })
        plans.push(plan)
        memberships.push(
            createMembership({
                id: 'membership-paused',
                userId: 'user-1',
                status: MembershipStatusEnum.Paused,
                planId: plan.id,
                plan
            })
        )

        const assigned = await service.assignUser('user-1', { planId: plan.id })

        expect(assigned).toMatchObject({
            id: 'membership-paused',
            status: MembershipStatusEnum.Active,
            planId: 'plan-target'
        })
        expect(memberships).toHaveLength(1)
    })

    it('rejects an assignment whose end date is not after its start date', async () => {
        jest.spyOn(RequestContext, 'currentTenantId').mockReturnValue('tenant-1')
        jest.spyOn(RequestContext, 'getOrganizationId').mockReturnValue(null)
        jest.spyOn(RequestContext, 'currentUserId').mockReturnValue('admin-1')
        const { plans, service } = createScopeInitializationHarness()
        const plan = createPlan({ id: 'plan-target' })
        plans.push(plan)

        await expect(
            service.assignUser('user-1', {
                planId: plan.id,
                currentPeriodStart: '2026-08-02T00:00:00.000Z',
                currentPeriodEnd: '2026-08-01T00:00:00.000Z'
            })
        ).rejects.toThrow('Membership period end must be later than its start.')
    })

    it('rejects assigning an organization plan to a user outside the current organization', async () => {
        jest.spyOn(RequestContext, 'currentTenantId').mockReturnValue('tenant-1')
        jest.spyOn(RequestContext, 'getOrganizationId').mockReturnValue('org-1')
        jest.spyOn(RequestContext, 'currentUserId').mockReturnValue('admin-1')
        const { plans, service, userOrganizationRepository } = createScopeInitializationHarness()
        plans.push(createPlan({ id: 'plan-target', organizationId: 'org-1' }))
        userOrganizationRepository.findOne.mockResolvedValue(null)

        await expect(service.assignUser('user-1', { planId: 'plan-target' })).rejects.toThrow(
            'The user is not an active member of the current organization.'
        )
    })

    it('expires other current memberships when assigning a plan', async () => {
        jest.spyOn(RequestContext, 'currentTenantId').mockReturnValue('tenant-1')
        jest.spyOn(RequestContext, 'getOrganizationId').mockReturnValue(null)
        jest.spyOn(RequestContext, 'currentUserId').mockReturnValue('admin-1')
        const { ledgers, memberships, plans, service } = createScopeInitializationHarness()
        const plan = createPlan({ id: 'plan-target' })
        plans.push(plan)
        memberships.push(
            createMembership({
                id: 'membership-old',
                userId: 'user-1',
                planId: 'plan-old',
                updatedAt: new Date('2026-07-01T00:00:00.000Z')
            }),
            createMembership({
                id: 'membership-current',
                userId: 'user-1',
                planId: plan.id,
                plan,
                updatedAt: new Date('2026-07-02T00:00:00.000Z')
            })
        )

        const assigned = await service.assignUser('user-1', { planId: plan.id })

        expect(assigned.id).toBe('membership-current')
        expect(memberships.find(({ id }) => id === 'membership-old')?.status).toBe(MembershipStatusEnum.Expired)
        expect(memberships.filter(({ status }) => status === MembershipStatusEnum.Active)).toHaveLength(1)
        expect(ledgers).toContainEqual(
            expect.objectContaining({
                membershipId: 'membership-old',
                source: MembershipLedgerSourceEnum.StatusChange,
                reason: 'Duplicate current membership replaced'
            })
        )
    })

    it('queues early renewals without resetting the current membership period', async () => {
        jest.spyOn(RequestContext, 'currentTenantId').mockReturnValue('tenant-1')
        jest.spyOn(RequestContext, 'getOrganizationId').mockReturnValue(null)
        const { memberships, periods, plans, service } = createScopeInitializationHarness()
        const plan = createPlan({ id: 'plan-renew' })
        plans.push(plan)
        const membership = createMembership({
            id: 'membership-renew',
            userId: 'user-1',
            planId: plan.id,
            plan,
            currentPeriodStart: new Date('2030-07-10T00:00:00.000Z'),
            currentPeriodEnd: new Date('2030-08-10T00:00:00.000Z'),
            pointsUsed: 25
        })
        memberships.push(membership)

        const renewed = await service.renewUser('user-1')

        expect(renewed.currentPeriodStart).toEqual(new Date('2030-07-10T00:00:00.000Z'))
        expect(renewed.currentPeriodEnd).toEqual(new Date('2030-08-10T00:00:00.000Z'))
        expect(renewed.pointsUsed).toBe(25)
        expect(periods).toEqual(
            expect.arrayContaining([
                expect.objectContaining({
                    status: MembershipPeriodStatusEnum.Active,
                    periodStart: new Date('2030-07-10T00:00:00.000Z'),
                    periodEnd: new Date('2030-08-10T00:00:00.000Z'),
                    pointsUsed: 25
                }),
                expect.objectContaining({
                    status: MembershipPeriodStatusEnum.Scheduled,
                    periodStart: new Date('2030-08-10T00:00:00.000Z'),
                    periodEnd: new Date('2030-09-10T00:00:00.000Z'),
                    pointsUsed: 0
                })
            ])
        )

        membership.plan.status = MembershipPlanStatusEnum.Archived
        await expect(service.renewUser('user-1')).rejects.toThrow('Archived membership plans cannot be renewed.')
    })

    it('resumes a paused membership when renewing without resetting the current period', async () => {
        jest.spyOn(RequestContext, 'currentTenantId').mockReturnValue('tenant-1')
        jest.spyOn(RequestContext, 'getOrganizationId').mockReturnValue(null)
        const { ledgers, memberships, periods, plans, service } = createScopeInitializationHarness()
        const plan = createPlan({ id: 'plan-paused-renew' })
        plans.push(plan)
        const membership = createMembership({
            id: 'membership-paused-renew',
            userId: 'user-1',
            planId: plan.id,
            plan,
            status: MembershipStatusEnum.Paused,
            currentPeriodStart: new Date('2030-07-10T00:00:00.000Z'),
            currentPeriodEnd: new Date('2030-08-10T00:00:00.000Z'),
            pointsUsed: 25
        })
        memberships.push(membership)

        const renewed = await service.renewUser('user-1')

        expect(renewed).toMatchObject({
            status: MembershipStatusEnum.Active,
            currentPeriodStart: new Date('2030-07-10T00:00:00.000Z'),
            currentPeriodEnd: new Date('2030-08-10T00:00:00.000Z'),
            pointsUsed: 25
        })
        expect(periods).toEqual(
            expect.arrayContaining([
                expect.objectContaining({
                    status: MembershipPeriodStatusEnum.Active,
                    periodStart: new Date('2030-07-10T00:00:00.000Z'),
                    periodEnd: new Date('2030-08-10T00:00:00.000Z'),
                    pointsUsed: 25
                }),
                expect.objectContaining({
                    status: MembershipPeriodStatusEnum.Scheduled,
                    periodStart: new Date('2030-08-10T00:00:00.000Z'),
                    periodEnd: new Date('2030-09-10T00:00:00.000Z')
                })
            ])
        )
        expect(ledgers).toContainEqual(
            expect.objectContaining({
                membershipId: membership.id,
                source: MembershipLedgerSourceEnum.StatusChange,
                reason: 'Membership resumed by renewal'
            })
        )
    })

    it('appends multiple idempotent periods with immutable plan snapshots', async () => {
        const { periods, plans, service } = createScopeInitializationHarness()
        const plan = createPlan({
            id: 'plan-prepaid',
            name: 'Original plan',
            includedPoints: 3000,
            allowedModels: [{ provider: 'openai', model: 'gpt-4.1' }]
        })
        plans.push(plan)

        const firstResult = await service.appendMembershipPeriods({
            tenantId: 'tenant-1',
            userId: 'user-1',
            planId: plan.id,
            count: 3,
            source: MembershipSourceEnum.External,
            sourceReference: 'order-1'
        })
        plan.name = 'Changed plan'
        plan.includedPoints = 9999
        const repeatedResult = await service.appendMembershipPeriods({
            tenantId: 'tenant-1',
            userId: 'user-1',
            planId: plan.id,
            count: 3,
            source: MembershipSourceEnum.External,
            sourceReference: 'order-1'
        })

        expect(firstResult).toHaveLength(3)
        expect(repeatedResult.map(({ id }) => id)).toEqual(firstResult.map(({ id }) => id))
        expect(periods).toHaveLength(3)
        expect(periods.map(({ status }) => status)).toEqual([
            MembershipPeriodStatusEnum.Active,
            MembershipPeriodStatusEnum.Scheduled,
            MembershipPeriodStatusEnum.Scheduled
        ])
        expect(periods[0].planSnapshot).toMatchObject({
            name: 'Original plan',
            includedPoints: 3000,
            allowedModels: [{ provider: 'openai', model: 'gpt-4.1' }]
        })
        expect(periods[1].periodStart).toEqual(periods[0].periodEnd)
        expect(periods[2].periodStart).toEqual(periods[1].periodEnd)
    })

    it('lets admins cancel assigned future periods without deleting them', async () => {
        jest.spyOn(RequestContext, 'currentTenantId').mockReturnValue('tenant-1')
        jest.spyOn(RequestContext, 'getOrganizationId').mockReturnValue(null)
        const { periods, plans, service } = createScopeInitializationHarness()
        const plan = createPlan({ id: 'plan-admin-period', includedPoints: 100 })
        plans.push(plan)

        await service.appendMembershipPeriods({
            tenantId: 'tenant-1',
            userId: 'user-1',
            planId: plan.id,
            count: 2,
            source: MembershipSourceEnum.Admin
        })
        const scheduledPeriod = periods.find(({ status }) => status === MembershipPeriodStatusEnum.Scheduled)
        if (!scheduledPeriod) {
            throw new Error('Expected a scheduled membership period.')
        }

        const cancelled = await service.cancelAdminUserPeriod('user-1', scheduledPeriod.id)

        expect(cancelled.status).toBe(MembershipPeriodStatusEnum.Cancelled)
        expect(periods).toContainEqual(expect.objectContaining({ id: scheduledPeriod.id }))
    })

    it('only lets admins cancel the last scheduled period', async () => {
        jest.spyOn(RequestContext, 'currentTenantId').mockReturnValue('tenant-1')
        jest.spyOn(RequestContext, 'getOrganizationId').mockReturnValue(null)
        const { periods, plans, service } = createScopeInitializationHarness()
        const plan = createPlan({ id: 'plan-tail-cancel', includedPoints: 100 })
        plans.push(plan)

        await service.appendMembershipPeriods({
            tenantId: 'tenant-1',
            userId: 'user-1',
            planId: plan.id,
            count: 3,
            source: MembershipSourceEnum.Admin
        })
        const scheduledPeriods = periods.filter(({ status }) => status === MembershipPeriodStatusEnum.Scheduled)
        if (scheduledPeriods.length !== 2) {
            throw new Error('Expected two scheduled membership periods.')
        }

        await expect(service.cancelAdminUserPeriod('user-1', scheduledPeriods[0].id)).rejects.toThrow(
            'Only the last scheduled membership period can be cancelled.'
        )

        const cancelled = await service.cancelAdminUserPeriod('user-1', scheduledPeriods[1].id)

        expect(cancelled.status).toBe(MembershipPeriodStatusEnum.Cancelled)
        expect(scheduledPeriods[0].status).toBe(MembershipPeriodStatusEnum.Scheduled)
    })

    it('requires externally managed periods to be cancelled with their source reference', async () => {
        jest.spyOn(RequestContext, 'currentTenantId').mockReturnValue('tenant-1')
        jest.spyOn(RequestContext, 'getOrganizationId').mockReturnValue(null)
        const { periods, plans, service } = createScopeInitializationHarness()
        const plan = createPlan({ id: 'plan-paid-period', includedPoints: 100 })
        plans.push(plan)

        await service.appendMembershipPeriods({
            tenantId: 'tenant-1',
            userId: 'user-1',
            planId: plan.id,
            count: 2,
            source: MembershipSourceEnum.External,
            sourceReference: 'order-paid'
        })
        const scheduledPeriod = periods.find(({ status }) => status === MembershipPeriodStatusEnum.Scheduled)
        if (!scheduledPeriod) {
            throw new Error('Expected a scheduled membership period.')
        }

        await expect(service.cancelAdminUserPeriod('user-1', scheduledPeriod.id)).rejects.toThrow(
            'Externally managed periods must be refunded and cancelled by the external billing system.'
        )

        const cancelled = await service.cancelScheduledMembershipPeriod({
            tenantId: 'tenant-1',
            userId: 'user-1',
            periodId: scheduledPeriod.id,
            sourceReference: 'order-paid'
        })

        expect(cancelled.status).toBe(MembershipPeriodStatusEnum.Cancelled)
    })

    it('requires external fulfillment to include a stable source reference', async () => {
        const { plans, service } = createScopeInitializationHarness()
        const plan = createPlan({ id: 'plan-external-reference', includedPoints: 100 })
        plans.push(plan)

        await expect(
            service.appendMembershipPeriods({
                tenantId: 'tenant-1',
                userId: 'user-1',
                planId: plan.id,
                count: 1,
                source: MembershipSourceEnum.External
            })
        ).rejects.toThrow('Externally managed membership periods require a source reference.')
    })

    it('upgrades only the current period and keeps future prepaid periods unchanged', async () => {
        const { memberships, periods, plans, service } = createScopeInitializationHarness()
        const plusPlan = createPlan({ id: 'plan-plus', name: 'Plus', includedPoints: 1000 })
        const proPlan = createPlan({ id: 'plan-pro', name: 'Pro', includedPoints: 5000 })
        plans.push(plusPlan, proPlan)

        await service.appendMembershipPeriods({
            tenantId: 'tenant-1',
            userId: 'user-1',
            planId: plusPlan.id,
            count: 2,
            sourceReference: 'order-plus'
        })
        const upgraded = await service.upgradeCurrentMembershipPeriod({
            tenantId: 'tenant-1',
            userId: 'user-1',
            planId: proPlan.id,
            pointsDelta: 1200,
            sourceReference: 'upgrade-1'
        })
        const repeated = await service.upgradeCurrentMembershipPeriod({
            tenantId: 'tenant-1',
            userId: 'user-1',
            planId: proPlan.id,
            pointsDelta: 1200,
            sourceReference: 'upgrade-1'
        })

        expect(upgraded.plan.name).toBe('Pro')
        expect(upgraded.pointsGranted).toBe(2200)
        expect(repeated.pointsGranted).toBe(2200)
        expect(memberships).toHaveLength(1)
        expect(periods.find(({ status }) => status === MembershipPeriodStatusEnum.Active)?.planSnapshot.name).toBe(
            'Pro'
        )
        expect(periods.find(({ status }) => status === MembershipPeriodStatusEnum.Scheduled)?.planSnapshot.name).toBe(
            'Plus'
        )
    })

    it('rejects an upgrade idempotency key reused with different fulfillment parameters', async () => {
        const { plans, service } = createScopeInitializationHarness()
        const plusPlan = createPlan({ id: 'plan-idempotent-plus', name: 'Plus', includedPoints: 1000 })
        const proPlan = createPlan({ id: 'plan-idempotent-pro', name: 'Pro', includedPoints: 5000 })
        plans.push(plusPlan, proPlan)

        await service.appendMembershipPeriods({
            tenantId: 'tenant-1',
            userId: 'user-1',
            planId: plusPlan.id,
            count: 1,
            sourceReference: 'order-idempotent-plus'
        })
        await service.upgradeCurrentMembershipPeriod({
            tenantId: 'tenant-1',
            userId: 'user-1',
            planId: proPlan.id,
            pointsDelta: 1200,
            sourceReference: 'upgrade-idempotency'
        })

        await expect(
            service.upgradeCurrentMembershipPeriod({
                tenantId: 'tenant-1',
                userId: 'user-1',
                planId: proPlan.id,
                pointsDelta: 1201,
                sourceReference: 'upgrade-idempotency'
            })
        ).rejects.toThrow('Membership upgrade request does not match the existing fulfillment.')
        await expect(
            service.upgradeCurrentMembershipPeriod({
                tenantId: 'tenant-1',
                organizationId: 'org-1',
                userId: 'user-1',
                planId: proPlan.id,
                pointsDelta: 1200,
                sourceReference: 'upgrade-idempotency'
            })
        ).rejects.toThrow('Membership upgrade request does not match the existing fulfillment.')
        await expect(
            service.upgradeCurrentMembershipPeriod({
                tenantId: 'tenant-1',
                userId: 'user-1',
                planId: plusPlan.id,
                pointsDelta: 1200,
                sourceReference: 'upgrade-idempotency'
            })
        ).rejects.toThrow('Membership upgrade request does not match the existing fulfillment.')
    })

    it('activates the queued snapshot at the period boundary', async () => {
        jest.useFakeTimers().setSystemTime(new Date('2026-07-15T00:00:00.000Z'))
        try {
            const { memberships, periods, plans, service } = createScopeInitializationHarness()
            const plan = createPlan({ id: 'plan-snapshot', name: 'Snapshot plan', includedPoints: 2000 })
            plans.push(plan)
            memberships.push(
                createMembership({
                    id: 'membership-current',
                    userId: 'user-1',
                    planId: plan.id,
                    plan,
                    currentPeriodStart: new Date('2026-07-01T00:00:00.000Z'),
                    currentPeriodEnd: new Date('2026-08-01T00:00:00.000Z'),
                    pointsGranted: 2000,
                    pointsUsed: 500
                })
            )

            await service.appendMembershipPeriods({
                tenantId: 'tenant-1',
                userId: 'user-1',
                planId: plan.id,
                count: 1,
                sourceReference: 'order-boundary'
            })
            plan.name = 'Plan changed later'
            plan.includedPoints = 9000

            jest.setSystemTime(new Date('2026-08-15T00:00:00.000Z'))
            const access = await service.findModelAccess({
                tenantId: 'tenant-1',
                userId: 'user-1'
            })

            expect(access?.membership.currentPeriodStart).toEqual(new Date('2026-08-01T00:00:00.000Z'))
            expect(access?.membership.currentPeriodEnd).toEqual(new Date('2026-09-01T00:00:00.000Z'))
            expect(access?.membership.pointsGranted).toBe(2000)
            expect(access?.membership.pointsUsed).toBe(0)
            expect(access?.membership.plan.name).toBe('Snapshot plan')
            expect(periods.filter(({ status }) => status === MembershipPeriodStatusEnum.Active)).toHaveLength(1)
            expect(periods.filter(({ status }) => status === MembershipPeriodStatusEnum.Completed)).toHaveLength(1)
        } finally {
            jest.useRealTimers()
        }
    })

    it('rejects invalid model multiplier and rate-limit plan rules', async () => {
        jest.spyOn(RequestContext, 'currentTenantId').mockReturnValue('tenant-1')
        jest.spyOn(RequestContext, 'getOrganizationId').mockReturnValue(null)
        const { service } = createScopeInitializationHarness()

        await expect(
            service.createPlan({
                code: 'bad-multiplier',
                name: 'Bad multiplier',
                modelMultipliers: [{ model: '*', multiplier: Number.NaN }]
            })
        ).rejects.toThrow('Each model multiplier must be a non-negative number.')
        await expect(
            service.createPlan({
                code: 'bad-limit',
                name: 'Bad limit',
                rateLimits: [{ model: '*', period: 'day', pointLimit: 0 }]
            })
        ).rejects.toThrow('Each rate limit requires a valid period and a positive point limit.')
    })

    it('still evaluates rate limits for unlimited memberships', async () => {
        const service = createMembershipService({} as never, {} as never, {} as never, {} as never, {} as never)
        const membership = createMembership({ pointsGranted: null, pointsUsed: 999 })
        jest.spyOn(service, 'findModelAccess').mockResolvedValue({
            tenantId: 'tenant-1',
            organizationId: null,
            membership
        })
        const assertRateLimits = jest
            .spyOn(getMembershipServiceTestAccess(service), 'assertRateLimits')
            .mockResolvedValue(undefined)

        await service.assertCanUse({
            tenantId: 'tenant-1',
            organizationId: null,
            copilotOrganizationId: null,
            userId: 'assistant-tech-user',
            provider: 'tongyi',
            model: 'qwen3.6-plus'
        })

        expect(assertRateLimits).toHaveBeenCalledWith(membership, 'tongyi', 'qwen3.6-plus')
    })
})
