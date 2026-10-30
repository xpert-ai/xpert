import {
    AIPermissionsEnum,
    MEMBERSHIP_CNY_PER_POINT_SETTING,
    MembershipPeriodEnum,
    MembershipPeriodStatusEnum,
    MembershipPlanStatusEnum,
    MembershipRenewalModeEnum,
    MembershipSourceEnum,
    MembershipStatusEnum,
    UserType
} from '@xpert-ai/contracts'
import { FeatureOrganization, User } from '@xpert-ai/server-core'
import { MembershipPeriod } from '../membership-period.entity'
import { MembershipPlan } from '../membership-plan.entity'
import { MembershipPointLedger } from '../membership-point-ledger.entity'
import { createMembershipFixture } from './membership.test-fixture'
import { UserMembership } from '../user-membership.entity'
type FeatureToggleFixture = {
    isEnabled: boolean
    feature?: {
        parentId?: string | null
    }
}
export function createQueryBuilder(rawRows: Array<Record<string, unknown>>) {
    return {
        setParameter: jest.fn().mockReturnThis(),
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

export function createMembership(overrides: Partial<UserMembership> = {}): UserMembership & {
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
            modelMultipliers: [],
            rateLimits: []
        },
        ...overrides
    } as UserMembership & { plan: NonNullable<UserMembership['plan']>; planId: string }
}

export function createPlan(overrides: Partial<MembershipPlan> = {}): MembershipPlan {
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
        modelMultipliers: [],
        rateLimits: [],
        ...overrides
    } as MembershipPlan
}

export function createMembershipFeatureRepository(
    resolveRows: (organizationId: string | null) => FeatureToggleFixture[] | Promise<FeatureToggleFixture[]> = () => [
        { isEnabled: true }
    ]
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

export function createMembershipService(
    dataSource: never = {} as never,
    planRepository: never = {} as never,
    membershipRepository: never = {} as never,
    ledgerRepository: never = {} as never,
    xpertRepository: never = {} as never,
    userRepository: never | undefined = {
        findOne: jest.fn(async ({ where }) => ({
            id: where.id,
            tenantId: where.tenantId,
            type: UserType.USER,
            role: {
                rolePermissions: [{ permission: AIPermissionsEnum.MEMBERSHIP_USE, enabled: true }]
            }
        })),
        find: jest.fn().mockResolvedValue([{ id: 'user-1' }, { id: 'user-2' }])
    } as never,
    userOrganizationRepository: never | undefined = undefined,
    copilotRepository: never | undefined = undefined,
    featureOrganizationRepository: never | undefined = createMembershipFeatureRepository().repository as never,
    tenantSettingRepository: never | undefined = undefined,
    periodRepository: never | undefined = undefined,
    organizationRepository: never | undefined = undefined,
    backfillQueueService: never | undefined = undefined
) {
    return createMembershipFixture(
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
        periodRepository,
        organizationRepository,
        backfillQueueService
    )
}

export function createScopeInitializationHarness(
    cnyPerPointSetting?: string,
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
    const matchesCatalogSource = (
        record: { catalogSourcePlanId?: string | null },
        where?: { catalogSourcePlanId?: unknown }
    ) => {
        if (where?.catalogSourcePlanId === undefined) {
            return true
        }
        if (typeof where.catalogSourcePlanId === 'string') {
            return record.catalogSourcePlanId === where.catalogSourcePlanId
        }
        return record.catalogSourcePlanId == null
    }
    const featureOrganizationRepository = createMembershipFeatureRepository(resolveFeatureRows).repository
    const tenantSettingRepository = {
        findOne: jest.fn().mockResolvedValue(
            cnyPerPointSetting
                ? {
                      tenantId: 'tenant-1',
                      name: MEMBERSHIP_CNY_PER_POINT_SETTING,
                      value: cnyPerPointSetting
                  }
                : null
        )
    }
    const backfillQueueService = {
        enqueueTenantDefaultMembershipBackfill: jest.fn().mockResolvedValue(undefined),
        enqueueTenantOrganizationDefaultMembershipBackfill: jest.fn().mockResolvedValue(undefined),
        enqueueOrganizationDefaultMembershipBackfill: jest.fn().mockResolvedValue(undefined)
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
            return plans.filter(
                (plan) =>
                    matchesScope(plan, where) && matchesCatalogSource(plan, where) && plan.status === where?.status
            ).length
        }),
        find: jest.fn(async ({ where }) =>
            plans.filter((plan) => matchesScope(plan, where) && matchesCatalogSource(plan, where))
        ),
        findOne: jest.fn(async ({ where }) => {
            const scopedPlans = plans.filter((plan) => matchesScope(plan, where) && matchesCatalogSource(plan, where))
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
            if (where?.code) {
                return scopedPlans.find((plan) => plan.code === where.code) ?? null
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
        find: jest.fn().mockResolvedValue([
            { id: 'user-organization-1', userId: 'user-1' },
            { id: 'user-organization-2', userId: 'user-2' }
        ]),
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
        findOne: jest.fn(async ({ where }) => ({
            id: where.id,
            tenantId: where.tenantId,
            type: UserType.USER,
            role: {
                rolePermissions: [
                    { permission: AIPermissionsEnum.MEMBERSHIP_USE, enabled: true },
                    ...(where.id === 'admin-1'
                        ? [{ permission: AIPermissionsEnum.MEMBERSHIP_EDIT, enabled: true }]
                        : [])
                ]
            }
        })),
        find: jest.fn().mockResolvedValue([
            {
                id: 'user-1',
                type: UserType.USER,
                role: {
                    rolePermissions: [{ permission: AIPermissionsEnum.MEMBERSHIP_USE, enabled: true }]
                }
            },
            {
                id: 'user-2',
                type: UserType.USER,
                role: {
                    rolePermissions: [{ permission: AIPermissionsEnum.MEMBERSHIP_USE, enabled: true }]
                }
            }
        ])
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
                            (organizationId === undefined || (membership.organizationId ?? null) === organizationId) &&
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
        findOne: jest.fn(async ({ where }) => memberships.find((membership) => membership.id === where?.id) ?? null),
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
                    (ledger) => ledger.tenantId === where?.tenantId && ledger.sourceReference === where?.sourceReference
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
            if (Array.isArray(period)) {
                return period.map((item) => {
                    const saved = {
                        ...item,
                        id: item.id ?? `period-${periods.length + 1}`
                    } as MembershipPeriod
                    const index = periods.findIndex((candidate) => candidate.id === saved.id)
                    if (index >= 0) {
                        periods[index] = saved
                    } else {
                        periods.push(saved)
                    }
                    return saved
                })
            }
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
                        (where?.tenantId === undefined || period.tenantId === where.tenantId) &&
                        (where?.organizationId === undefined ||
                            (period.organizationId ?? null) ===
                                (typeof where.organizationId === 'string' ? where.organizationId : null)) &&
                        (where?.id === undefined || period.id === where.id) &&
                        (where?.userId === undefined || period.userId === where.userId) &&
                        (where?.membershipId === undefined || period.membershipId === where.membershipId) &&
                        (where?.sourceReference === undefined || period.sourceReference === where.sourceReference) &&
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
                        (where?.sourceReference === undefined || period.sourceReference === where.sourceReference) &&
                        (typeof where?.status !== 'string' || period.status === where.status)
                )
                .sort((left, right) => {
                    const direction = order?.periodStart === 'DESC' ? -1 : 1
                    return (new Date(left.periodStart).getTime() - new Date(right.periodStart).getTime()) * direction
                })
        ),
        createQueryBuilder: jest.fn(() => {
            let tenantId: string | undefined
            let organizationId: string | null | undefined
            let membershipId: string | undefined
            let userId: string | undefined
            let sourceReference: string | undefined
            let status: MembershipPeriodStatusEnum | undefined
            let statuses: MembershipPeriodStatusEnum[] | undefined
            let nextStatus: MembershipPeriodStatusEnum | undefined
            let orderDirection: 'ASC' | 'DESC' = 'ASC'
            const capture = (
                condition: string,
                parameters?: {
                    tenantId?: string
                    organizationId?: string
                    membershipId?: string
                    userId?: string
                    sourceReference?: string
                    status?: MembershipPeriodStatusEnum
                    statuses?: MembershipPeriodStatusEnum[]
                }
            ) => {
                if (condition.includes('tenantId = :tenantId')) {
                    tenantId = parameters?.tenantId
                }
                if (condition.includes('organizationId = :organizationId')) {
                    organizationId = parameters?.organizationId
                }
                if (condition.includes('organizationId IS NULL')) {
                    organizationId = null
                }
                if (condition.includes('membershipId = :membershipId')) {
                    membershipId = parameters?.membershipId
                }
                if (condition.includes('userId = :userId')) {
                    userId = parameters?.userId
                }
                if (condition.includes('sourceReference = :sourceReference')) {
                    sourceReference = parameters?.sourceReference
                }
                if (condition.includes('status = :status')) {
                    status = parameters?.status
                }
                if (condition.includes('status IN (:...statuses)')) {
                    statuses = parameters?.statuses
                }
            }
            const builder = {
                update: jest.fn().mockReturnThis(),
                set: jest.fn((input) => {
                    nextStatus = input.status
                    return builder
                }),
                select: jest.fn().mockReturnThis(),
                addSelect: jest.fn().mockReturnThis(),
                groupBy: jest.fn().mockReturnThis(),
                addGroupBy: jest.fn().mockReturnThis(),
                where: jest.fn((condition, parameters) => {
                    capture(condition, parameters)
                    return builder
                }),
                andWhere: jest.fn((condition, parameters) => {
                    capture(condition, parameters)
                    return builder
                }),
                orderBy: jest.fn((_column, direction) => {
                    orderDirection = direction ?? 'ASC'
                    return builder
                }),
                setLock: jest.fn().mockReturnThis(),
                getRawMany: jest.fn().mockResolvedValue([]),
                getMany: jest.fn(async () =>
                    periods
                        .filter(
                            (period) =>
                                (tenantId === undefined || period.tenantId === tenantId) &&
                                (organizationId === undefined || (period.organizationId ?? null) === organizationId) &&
                                (membershipId === undefined || period.membershipId === membershipId) &&
                                (userId === undefined || period.userId === userId) &&
                                (sourceReference === undefined || period.sourceReference === sourceReference) &&
                                (status === undefined || period.status === status) &&
                                (!statuses?.length || statuses.includes(period.status))
                        )
                        .sort((left, right) => {
                            const difference =
                                new Date(left.periodStart).getTime() - new Date(right.periodStart).getTime()
                            return orderDirection === 'DESC' ? -difference : difference
                        })
                ),
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
        connection: { options: { type: 'sqlite' } },
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
            const releaseLocks: Array<() => void> = []
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
                    releaseLocks.push(() => {
                        releaseCurrentLock()
                        if (advisoryLockTails.get(lockKey) === currentLock) {
                            advisoryLockTails.delete(lockKey)
                        }
                    })
                    await previousLock
                })
            }
            transactionManagers.push(transactionManager)
            try {
                return await callback(transactionManager)
            } finally {
                while (releaseLocks.length) {
                    releaseLocks.pop()?.()
                }
            }
        })
    }
    const organizationRepository = {
        find: jest.fn().mockResolvedValue([{ id: 'org-1' }, { id: 'org-2' }])
    }

    return {
        dataSource,
        ledgers,
        ledgerRepository,
        memberships,
        membershipRepository,
        organizationRepository,
        userRepository,
        planRepository,
        plans,
        periodRepository,
        periods,
        transactionManagers,
        userOrganizationRepository,
        backfillQueueService,
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
            periodRepository as never,
            organizationRepository as never,
            backfillQueueService as never
        )
    }
}
