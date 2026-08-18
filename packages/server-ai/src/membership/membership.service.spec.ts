jest.mock('../xpert/xpert.entity', () => ({
    Xpert: class Xpert {}
}))

import { MembershipService } from './membership.service'
import { ForbiddenException } from '@nestjs/common'
import { MembershipPlan } from './membership-plan.entity'
import { MembershipPeriod } from './membership-period.entity'
import { MembershipPointLedger } from './membership-point-ledger.entity'
import { UserMembership } from './user-membership.entity'
import { Xpert } from '../xpert/xpert.entity'
import { FeatureOrganization, RequestContext, User } from '@xpert-ai/server-core'
import {
    AIPermissionsEnum,
    AiModelTypeEnum,
    DEFAULT_MEMBERSHIP_CNY_PER_POINT,
    MEMBERSHIP_CNY_PER_POINT_SETTING,
    MembershipLedgerSourceEnum,
    MembershipPeriodEnum,
    MembershipPeriodStatusEnum,
    MembershipPlanStatusEnum,
    MembershipRenewalModeEnum,
    MembershipSourceEnum,
    MembershipStatusEnum,
    ModelAccessChannelEnum,
    ModelAccessOwnershipScopeEnum,
    ModelAccessSourceEnum,
    ModelGatewayUsageChannelEnum,
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
        findMembershipPresentationAccess: (...args: unknown[]) => Promise<unknown>
        findTopLedgerRanks: (...args: unknown[]) => Promise<unknown[]>
        hasMembershipUsePermission: (...args: unknown[]) => Promise<boolean>
        renewMembership: (...args: unknown[]) => Promise<unknown>
        createMembershipStatusLedger: (...args: unknown[]) => Promise<void>
        requireManagedMembership: (...args: unknown[]) => Promise<unknown>
        findMembershipById: (...args: unknown[]) => Promise<unknown>
        isMembershipPlanEnabledForScope: (...args: unknown[]) => Promise<boolean>
        acquireMembershipAssignmentLock: (...args: unknown[]) => Promise<void>
        acquireGatewayRequestLock: (...args: unknown[]) => Promise<void>
        findModelAccessWithOrganizationSelfHeal: (...args: unknown[]) => Promise<unknown>
        resolveTenantCnyPerPoint: (...args: unknown[]) => Promise<number>
        synchronizeCurrentPeriodProjection: (...args: unknown[]) => Promise<void>
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
            periodRepository,
            organizationRepository,
            backfillQueueService
        )
    }

    it('includes the selected tenant-local day in the admin member expiration filter', async () => {
        jest.spyOn(RequestContext, 'currentTenantId').mockReturnValue('tenant-1')
        jest.spyOn(RequestContext, 'getOrganizationId').mockReturnValue(null)
        const membershipSubquery = {
            select: jest.fn().mockReturnThis(),
            from: jest.fn().mockReturnThis(),
            where: jest.fn().mockReturnThis(),
            andWhere: jest.fn().mockReturnThis(),
            orderBy: jest.fn().mockReturnThis(),
            addOrderBy: jest.fn().mockReturnThis(),
            limit: jest.fn().mockReturnThis(),
            getQuery: jest.fn().mockReturnValue('SELECT candidate.id')
        }
        const userQueryBuilder = {
            where: jest.fn().mockReturnThis(),
            andWhere: jest.fn().mockReturnThis(),
            subQuery: jest.fn(() => membershipSubquery),
            leftJoinAndMapOne: jest.fn().mockReturnThis(),
            leftJoinAndSelect: jest.fn().mockReturnThis(),
            orderBy: jest.fn().mockReturnThis(),
            addOrderBy: jest.fn().mockReturnThis(),
            take: jest.fn().mockReturnThis(),
            skip: jest.fn().mockReturnThis(),
            getManyAndCount: jest.fn().mockResolvedValue([[], 0])
        }
        const userRepository = {
            createQueryBuilder: jest.fn(() => userQueryBuilder)
        }
        const organizationRepository = {
            findOne: jest.fn().mockResolvedValue({
                id: 'default-org',
                timeZone: 'Asia/Shanghai'
            })
        }
        const service = createMembershipService(
            {} as never,
            {} as never,
            {} as never,
            {} as never,
            {} as never,
            userRepository as never,
            undefined,
            undefined,
            createMembershipFeatureRepository().repository as never,
            undefined,
            undefined,
            organizationRepository as never
        )

        await service.findAdminMembers({ expiringBefore: '2027-03-14' })

        expect(organizationRepository.findOne).toHaveBeenCalledWith({
            where: { tenantId: 'tenant-1', isDefault: true },
            select: { id: true, timeZone: true }
        })
        expect(userQueryBuilder.andWhere).toHaveBeenCalledWith('membership.currentPeriodEnd <= :expiringBefore', {
            expiringBefore: new Date('2027-03-14T15:59:59.999Z')
        })
    })

    it('uses a unique tie-breaker when paginating assigned plan members', async () => {
        jest.spyOn(RequestContext, 'currentTenantId').mockReturnValue('tenant-1')
        jest.spyOn(RequestContext, 'getOrganizationId').mockReturnValue(null)
        const queryBuilder = {
            leftJoinAndSelect: jest.fn().mockReturnThis(),
            where: jest.fn().mockReturnThis(),
            andWhere: jest.fn().mockReturnThis(),
            orderBy: jest.fn().mockReturnThis(),
            addOrderBy: jest.fn().mockReturnThis(),
            take: jest.fn().mockReturnThis(),
            skip: jest.fn().mockReturnThis(),
            getManyAndCount: jest.fn().mockResolvedValue([[], 0])
        }
        const membershipRepository = {
            createQueryBuilder: jest.fn(() => queryBuilder)
        }
        const service = createMembershipService(
            {} as never,
            {} as never,
            membershipRepository as never,
            {} as never,
            {} as never
        )

        await service.findAdminUsers({ planId: 'plan-1', take: 20, skip: 20 })

        expect(queryBuilder.orderBy).toHaveBeenCalledWith('membership.updatedAt', 'DESC')
        expect(queryBuilder.addOrderBy).toHaveBeenCalledWith('membership.id', 'DESC')
    })

    it('lists the current tenant and organization memberships for a tenant administrator', async () => {
        jest.spyOn(RequestContext, 'currentTenantId').mockReturnValue('tenant-1')
        jest.spyOn(RequestContext, 'getOrganizationId').mockReturnValue(null)
        const tenantMembership = createMembership({
            id: 'membership-tenant',
            organizationId: null,
            plan: createPlan({ id: 'plan-tenant', name: 'Tenant plan' })
        })
        const organizationMembership = createMembership({
            id: 'membership-org',
            organizationId: 'org-1',
            organization: { id: 'org-1', name: 'Organization 1' } as UserMembership['organization'],
            plan: createPlan({ id: 'plan-org', organizationId: 'org-1', name: 'Organization plan' })
        })
        const duplicateOrganizationMembership = createMembership({
            id: 'membership-org-older',
            organizationId: 'org-1',
            organization: { id: 'org-1', name: 'Organization 1' } as UserMembership['organization'],
            status: MembershipStatusEnum.Paused
        })
        const queryBuilder = {
            leftJoinAndSelect: jest.fn().mockReturnThis(),
            where: jest.fn().mockReturnThis(),
            andWhere: jest.fn().mockReturnThis(),
            orderBy: jest.fn().mockReturnThis(),
            addOrderBy: jest.fn().mockReturnThis(),
            getMany: jest
                .fn()
                .mockResolvedValue([tenantMembership, organizationMembership, duplicateOrganizationMembership])
        }
        const membershipRepository = {
            createQueryBuilder: jest.fn(() => queryBuilder)
        }
        const service = createMembershipService(
            {} as never,
            {} as never,
            membershipRepository as never,
            {} as never,
            {} as never
        )

        const memberships = await service.findAdminUserScopeMemberships('owner-user')

        expect(memberships.map(({ id }) => id)).toEqual(['membership-tenant', 'membership-org'])
        expect(queryBuilder.leftJoinAndSelect).toHaveBeenCalledWith('membership.organization', 'organization')
        expect(queryBuilder.andWhere).toHaveBeenCalledWith('membership.status IN (:...statuses)', {
            statuses: [MembershipStatusEnum.Active, MembershipStatusEnum.Paused]
        })
    })

    it('does not expose cross-organization memberships from organization scope', async () => {
        jest.spyOn(RequestContext, 'currentTenantId').mockReturnValue('tenant-1')
        jest.spyOn(RequestContext, 'getOrganizationId').mockReturnValue('org-1')
        const service = createMembershipService()

        await expect(service.findAdminUserScopeMemberships('owner-user')).rejects.toBeInstanceOf(ForbiddenException)
    })

    it('lists membership periods from every scope for a tenant administrator', async () => {
        jest.spyOn(RequestContext, 'currentTenantId').mockReturnValue('tenant-1')
        jest.spyOn(RequestContext, 'getOrganizationId').mockReturnValue(null)
        const periodRepository = {
            find: jest.fn().mockResolvedValue([])
        }
        const service = createMembershipService(
            {} as never,
            {} as never,
            {} as never,
            {} as never,
            {} as never,
            undefined,
            undefined,
            undefined,
            undefined,
            undefined,
            periodRepository as never
        )

        await service.findAdminUserPeriods('owner-user')

        expect(periodRepository.find).toHaveBeenCalledWith({
            where: {
                tenantId: 'tenant-1',
                userId: 'owner-user'
            },
            relations: ['plan'],
            order: { periodStart: 'ASC' }
        })
    })

    it('lists membership audit entries from every scope for a tenant administrator', async () => {
        jest.spyOn(RequestContext, 'currentTenantId').mockReturnValue('tenant-1')
        jest.spyOn(RequestContext, 'getOrganizationId').mockReturnValue(null)
        const queryBuilder = {
            leftJoinAndSelect: jest.fn().mockReturnThis(),
            where: jest.fn().mockReturnThis(),
            andWhere: jest.fn().mockReturnThis(),
            orderBy: jest.fn().mockReturnThis(),
            take: jest.fn().mockReturnThis(),
            skip: jest.fn().mockReturnThis(),
            getManyAndCount: jest.fn().mockResolvedValue([[], 0])
        }
        const ledgerRepository = {
            createQueryBuilder: jest.fn(() => queryBuilder)
        }
        const service = createMembershipService(
            {} as never,
            {} as never,
            {} as never,
            ledgerRepository as never,
            {} as never
        )

        await service.findAdminUserAudit('owner-user')

        expect(queryBuilder.leftJoinAndSelect).toHaveBeenCalledWith('ledger.user', 'user')
        expect(queryBuilder.leftJoinAndSelect).toHaveBeenCalledWith('ledger.membership', 'membership')
        expect(queryBuilder.leftJoinAndSelect).toHaveBeenCalledWith('membership.organization', 'organization')
        expect(queryBuilder.andWhere).not.toHaveBeenCalledWith('ledger.organizationId IS NULL')
    })

    it('maps one CNY of settled model cost to ten existing membership points', () => {
        const service = createMembershipService({} as never, {} as never, {} as never, {} as never, {} as never)

        expect(service.calculatePointsFromCny(1)).toBe(10)
        expect(service.calculatePointsFromCny(0.125)).toBe(1.25)
    })

    it('settles due active memberships in a transaction', async () => {
        const candidate = createMembership({
            currentPeriodEnd: new Date('2026-07-01T00:00:00.000Z')
        })
        const queryBuilder = {
            innerJoinAndSelect: jest.fn().mockReturnThis(),
            where: jest.fn().mockReturnThis(),
            andWhere: jest.fn().mockReturnThis(),
            orderBy: jest.fn().mockReturnThis(),
            take: jest.fn().mockReturnThis(),
            getMany: jest.fn().mockResolvedValue([candidate])
        }
        const membershipRepository = {
            createQueryBuilder: jest.fn(() => queryBuilder)
        }
        const manager = {}
        const dataSource = {
            transaction: jest.fn((run: (transactionManager: object) => Promise<unknown>) => run(manager))
        }
        const service = createMembershipService(
            dataSource as never,
            {} as never,
            membershipRepository as never,
            {} as never,
            {} as never
        )
        const access = getMembershipServiceTestAccess(service)
        jest.spyOn(access, 'isMembershipPlanEnabledForScope').mockResolvedValue(true)
        jest.spyOn(access, 'acquireMembershipAssignmentLock').mockResolvedValue(undefined)
        jest.spyOn(access, 'findMembershipForUpdate').mockResolvedValue(candidate)
        jest.spyOn(access, 'findUsableMembership').mockResolvedValue(candidate)

        const result = await service.processDueMembershipPeriods()

        expect(result).toEqual({ scanned: 1, settled: 1, skipped: 0, failed: 0 })
        expect(access.findUsableMembership).toHaveBeenCalledWith(
            candidate.tenantId,
            null,
            candidate.userId,
            manager,
            true
        )
    })

    it('records the current operator on membership audit ledger entries', async () => {
        const ledgerRepository = {
            create: jest.fn((input) => input),
            save: jest.fn(async (input) => ({ id: 'ledger-1', ...input }))
        }
        const service = createMembershipService(
            {} as never,
            {} as never,
            {} as never,
            ledgerRepository as never,
            {} as never
        )
        jest.spyOn(RequestContext, 'currentUserId').mockReturnValue('admin-1')

        await getMembershipServiceTestAccess(service).createLedger(undefined, {
            tenantId: 'tenant-1',
            userId: 'user-1',
            source: MembershipLedgerSourceEnum.StatusChange,
            pointsDelta: 0
        })

        expect(ledgerRepository.create).toHaveBeenCalledWith(
            expect.objectContaining({
                actorId: 'admin-1'
            })
        )
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
                const scopedPlans = plans.filter(
                    (plan) => matchesScope(plan, where) && matchesCatalogSource(plan, where)
                )
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
                                    (organizationId === undefined ||
                                        (period.organizationId ?? null) === organizationId) &&
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

    it('does not synchronize assigned memberships when the plan allowance is unchanged', async () => {
        jest.spyOn(RequestContext, 'currentTenantId').mockReturnValue('tenant-1')
        jest.spyOn(RequestContext, 'getOrganizationId').mockReturnValue(null)
        const { ledgers, memberships, service } = createScopeInitializationHarness()
        const plan = await service.createPlan({ code: 'assigned', name: 'Assigned', includedPoints: 1000 })
        memberships.push(createMembership({ planId: plan.id, pointsGranted: 1000, pointsUsed: 100 }))

        await service.updatePlan(plan.id, { description: 'Updated description', includedPoints: 1000 })

        expect(memberships[0].pointsGranted).toBe(1000)
        expect(ledgers).not.toContainEqual(expect.objectContaining({ reason: 'Membership plan allowance updated' }))
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

    it('enqueues a tenant backfill after creating a default plan', async () => {
        jest.spyOn(RequestContext, 'currentTenantId').mockReturnValue('tenant-1')
        jest.spyOn(RequestContext, 'getOrganizationId').mockReturnValue(null)
        const { backfillQueueService, memberships, service } = createScopeInitializationHarness()

        await service.createPlan({
            code: 'default',
            name: 'Default',
            isDefault: true
        })

        expect(backfillQueueService.enqueueTenantDefaultMembershipBackfill).toHaveBeenCalledWith('tenant-1')
        expect(memberships).toHaveLength(0)
    })

    it('enqueues a tenant backfill only when a plan becomes the active default', async () => {
        jest.spyOn(RequestContext, 'currentTenantId').mockReturnValue('tenant-1')
        jest.spyOn(RequestContext, 'getOrganizationId').mockReturnValue(null)
        const { backfillQueueService, service } = createScopeInitializationHarness()
        const plan = await service.createPlan({
            code: 'candidate',
            name: 'Candidate'
        })
        backfillQueueService.enqueueTenantDefaultMembershipBackfill.mockClear()

        await service.updatePlan(plan.id, { name: 'Renamed candidate' })
        expect(backfillQueueService.enqueueTenantDefaultMembershipBackfill).not.toHaveBeenCalled()

        await service.updatePlan(plan.id, { isDefault: true })
        expect(backfillQueueService.enqueueTenantDefaultMembershipBackfill).toHaveBeenCalledWith('tenant-1')

        backfillQueueService.enqueueTenantDefaultMembershipBackfill.mockClear()
        await service.updatePlan(plan.id, { name: 'Renamed default' })
        expect(backfillQueueService.enqueueTenantDefaultMembershipBackfill).not.toHaveBeenCalled()
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
                usageChannel: ModelGatewayUsageChannelEnum.ExternalApi,
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

        const result = await service.findUserUsageSummaries(
            'tenant-1',
            'user-1',
            { usageChannel: ModelGatewayUsageChannelEnum.ExternalApi },
            { take: 20, skip: 0 }
        )

        expect(result.total).toBe(1)
        expect(result.items[0]).toMatchObject({
            usageHour: '2026-06-30 14',
            usageChannel: ModelGatewayUsageChannelEnum.ExternalApi,
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
                usageChannel: ModelGatewayUsageChannelEnum.ExternalApi,
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
        expect(queryBuilder.andWhere).toHaveBeenCalledWith('ledger.usageChannel = :usageChannel', {
            usageChannel: ModelGatewayUsageChannelEnum.ExternalApi
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
        expect(queryBuilder.addSelect).toHaveBeenCalledWith('ledger.usageChannel', 'usageChannel')
        expect(queryBuilder.addGroupBy).toHaveBeenCalledWith('ledger.usageChannel')
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

    it('keeps historical usage available without current membership access', async () => {
        jest.spyOn(RequestContext, 'currentTenantId').mockReturnValue('tenant-1')
        jest.spyOn(RequestContext, 'getOrganizationId').mockReturnValue('org-1')
        jest.spyOn(RequestContext, 'currentUserId').mockReturnValue('owner-user')
        const service = createMembershipService()
        jest.spyOn(service, 'findModelAccess').mockResolvedValue(null)
        jest.spyOn(getMembershipServiceTestAccess(service), 'findMembershipPresentationAccess').mockResolvedValue(null)
        const usage = { items: [], total: 0 }
        jest.spyOn(service, 'findUserUsage').mockResolvedValue(usage)

        await expect(service.findMyUsage()).resolves.toBe(usage)
        expect(service.findUserUsage).toHaveBeenCalledWith('tenant-1', 'owner-user', undefined, undefined)
    })

    it('builds historical usage overview without current membership access', async () => {
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
        const service = createMembershipService(
            {} as never,
            {} as never,
            {} as never,
            { createQueryBuilder: jest.fn().mockReturnValue(queryBuilder) } as never,
            {} as never
        )
        const internals = getMembershipServiceTestAccess(service)
        jest.spyOn(internals, 'findMembershipPresentationAccess').mockResolvedValue(null)
        jest.spyOn(internals, 'findTopLedgerRanks').mockResolvedValue([])

        const overview = await service.getOverview({
            start: '2026-07-01T00:00:00.000Z',
            end: '2026-07-31T23:59:59.999Z'
        })

        expect(overview).toMatchObject({
            totalTokens: 1000,
            peakDailyTokens: 1000,
            activeDays: 1,
            buckets: [{ date: '2026-07-23', pointsUsed: 1, tokenUsed: 1000 }]
        })
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
                organizationId: 'org-1',
                catalogSourcePlanId: expect.objectContaining({
                    _type: 'isNull'
                })
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

    it('keeps explicit tenant scope when the current request belongs to an organization', async () => {
        const requestedScopes: Array<string | null> = []
        const featureOrganizationRepository = createMembershipFeatureRepository((organizationId) => {
            requestedScopes.push(organizationId)
            return organizationId === 'org-1' ? [{ isEnabled: false }] : [{ isEnabled: true }]
        }).repository
        jest.spyOn(RequestContext, 'getOrganizationId').mockReturnValue('org-1')
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
        ).resolves.toBe(true)
        expect(requestedScopes).toEqual([null])
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

    it('allows direct model usage without consulting membership access', async () => {
        const service = createMembershipService({} as never, {} as never, {} as never, {} as never, {} as never)
        const isMembershipAccessEnabled = jest.spyOn(service, 'isMembershipAccessEnabled')
        const findModelAccess = jest.spyOn(service, 'findModelAccess')

        await expect(
            service.assertCanUse(
                {
                    tenantId: 'tenant-1',
                    organizationId: 'org-1',
                    copilotOrganizationId: 'org-1',
                    userId: 'assistant-tech-user',
                    provider: 'deepseek',
                    model: 'deepseek-chat'
                },
                {
                    allowed: true,
                    channel: ModelAccessChannelEnum.Xpert,
                    billableUserId: 'assistant-tech-user',
                    copilotId: 'org-copilot',
                    copilotModelId: 'deepseek-chat',
                    provider: 'deepseek',
                    modelType: AiModelTypeEnum.LLM,
                    model: 'deepseek-chat',
                    accessSource: ModelAccessSourceEnum.Direct,
                    multiplier: 1,
                    scope: ModelAccessOwnershipScopeEnum.Organization,
                    organizationId: 'org-1'
                }
            )
        ).resolves.toBeUndefined()
        expect(isMembershipAccessEnabled).not.toHaveBeenCalled()
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

    it('does not record membership usage for direct model access', async () => {
        const dataSource = {
            transaction: jest.fn()
        }
        const service = createMembershipService(dataSource as never, {} as never, {} as never, {} as never, {} as never)
        const isMembershipAccessEnabled = jest.spyOn(service, 'isMembershipAccessEnabled')

        await expect(
            service.recordUsage({
                tenantId: 'tenant-1',
                organizationId: 'org-1',
                copilotOrganizationId: 'org-1',
                userId: 'assistant-tech-user',
                provider: 'deepseek',
                model: 'deepseek-chat',
                tokenUsed: 1000,
                modelAccess: {
                    allowed: true,
                    channel: ModelAccessChannelEnum.Xpert,
                    billableUserId: 'assistant-tech-user',
                    copilotId: 'org-copilot',
                    copilotModelId: 'deepseek-chat',
                    provider: 'deepseek',
                    modelType: AiModelTypeEnum.LLM,
                    model: 'deepseek-chat',
                    accessSource: ModelAccessSourceEnum.Direct,
                    multiplier: 1,
                    scope: ModelAccessOwnershipScopeEnum.Organization,
                    organizationId: 'org-1'
                }
            })
        ).resolves.toBeNull()
        expect(isMembershipAccessEnabled).not.toHaveBeenCalled()
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

    it('assigns an initialized organization Default to a user with use permission but no edit permission', async () => {
        const { memberships, plans, service } = createScopeInitializationHarness()
        plans.push(
            createPlan({
                id: 'plan-org-default',
                organizationId: 'org-1'
            })
        )

        const membership = await service.ensureUserAssignedIfScopeInitialized({
            tenantId: 'tenant-1',
            organizationId: 'org-1',
            userId: 'user-1'
        })

        expect(membership).toMatchObject({
            organizationId: 'org-1',
            userId: 'user-1',
            planId: 'plan-org-default'
        })
        expect(memberships).toHaveLength(1)
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

    it('does not grant the tenant default membership without membership use permission', async () => {
        const { ledgers, memberships, plans, service, userRepository } = createScopeInitializationHarness()
        plans.push(createPlan({ id: 'plan-tenant-default' }))
        userRepository.findOne.mockImplementation(async ({ where }) => ({
            id: where.id,
            tenantId: where.tenantId,
            type: UserType.USER,
            role: { rolePermissions: [] }
        }))

        await expect(
            service.ensureTenantDefaultMembership({
                tenantId: 'tenant-1',
                userId: 'trial-user'
            })
        ).resolves.toBeNull()

        expect(plans).toHaveLength(1)
        expect(memberships).toHaveLength(0)
        expect(ledgers).toHaveLength(0)
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

    it('applies a referenced personal-point adjustment idempotently', async () => {
        const { ledgers, service } = createScopeInitializationHarness()
        jest.spyOn(getMembershipServiceTestAccess(service), 'getPersonalPointsBalance')
            .mockResolvedValueOnce(0)
            .mockResolvedValueOnce(25)

        const input = {
            tenantId: 'tenant-1',
            userId: 'user-1',
            pointDelta: 25,
            sourceReference: 'point-order-1',
            actorId: 'buyer-1',
            reason: 'External point fulfillment'
        }
        const first = await service.applyPersonalPointsAdjustment(input)
        const repeated = await service.applyPersonalPointsAdjustment(input)

        expect(first).toEqual({ userId: 'user-1', balance: 25 })
        expect(repeated).toEqual({ userId: 'user-1', balance: 25 })
        expect(
            ledgers.filter(
                ({ tenantId, sourceReference }) =>
                    tenantId === input.tenantId && sourceReference === input.sourceReference
            )
        ).toHaveLength(1)
        expect(ledgers).toContainEqual(
            expect.objectContaining({
                tenantId: 'tenant-1',
                userId: 'user-1',
                membershipId: null,
                source: MembershipLedgerSourceEnum.PersonalAdjustment,
                sourceReference: 'point-order-1',
                actorId: 'buyer-1',
                pointsDelta: 25
            })
        )
    })

    it('uses a caller-provided transaction for a referenced personal-point adjustment', async () => {
        const { dataSource, service } = createScopeInitializationHarness()
        jest.spyOn(getMembershipServiceTestAccess(service), 'getPersonalPointsBalance').mockResolvedValue(0)

        await dataSource.transaction((manager) =>
            service.applyPersonalPointsAdjustment(
                {
                    tenantId: 'tenant-1',
                    userId: 'user-1',
                    pointDelta: 25,
                    sourceReference: 'point-order-transaction'
                },
                manager as never
            )
        )

        expect(dataSource.transaction).toHaveBeenCalledTimes(1)
    })

    it('rejects a referenced personal-point adjustment replayed with different accounting data', async () => {
        const { service } = createScopeInitializationHarness()
        jest.spyOn(getMembershipServiceTestAccess(service), 'getPersonalPointsBalance').mockResolvedValue(0)

        await service.applyPersonalPointsAdjustment({
            tenantId: 'tenant-1',
            userId: 'user-1',
            pointDelta: 25,
            sourceReference: 'point-order-mismatch'
        })

        await expect(
            service.applyPersonalPointsAdjustment({
                tenantId: 'tenant-1',
                userId: 'user-1',
                pointDelta: 30,
                sourceReference: 'point-order-mismatch'
            })
        ).rejects.toThrow('Personal points adjustment does not match the existing fulfillment.')
        await expect(
            service.applyPersonalPointsAdjustment({
                tenantId: 'tenant-1',
                userId: 'user-2',
                pointDelta: 25,
                sourceReference: 'point-order-mismatch'
            })
        ).rejects.toThrow('Personal points adjustment does not match the existing fulfillment.')
    })

    it('rejects a referenced personal-point debit that would make the balance negative', async () => {
        const { service } = createScopeInitializationHarness()
        jest.spyOn(getMembershipServiceTestAccess(service), 'getPersonalPointsBalance').mockResolvedValue(10)

        await expect(
            service.applyPersonalPointsAdjustment({
                tenantId: 'tenant-1',
                userId: 'user-1',
                pointDelta: -11,
                sourceReference: 'point-refund-too-large'
            })
        ).rejects.toThrow('Personal points balance cannot be negative.')
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

    it('does not expose membership model access without membership use permission', async () => {
        const userRepository = {
            findOne: jest.fn(async ({ where }) => ({
                id: where.id,
                tenantId: where.tenantId,
                type: UserType.USER,
                role: { rolePermissions: [] }
            }))
        }
        const service = createMembershipService(
            {} as never,
            {} as never,
            {} as never,
            {} as never,
            {} as never,
            userRepository as never
        )
        const findUsableMembership = jest
            .spyOn(getMembershipServiceTestAccess(service), 'findUsableMembership')
            .mockResolvedValue(createMembership({ organizationId: 'org-1' }))

        await expect(
            service.findModelAccess({
                tenantId: 'tenant-1',
                organizationId: 'org-1',
                userId: 'assistant-tech-user'
            })
        ).resolves.toBeNull()
        expect(findUsableMembership).not.toHaveBeenCalled()
    })

    it('does not self-heal organization membership without membership use permission', async () => {
        const userRepository = {
            findOne: jest.fn(async ({ where }) => ({
                id: where.id,
                tenantId: where.tenantId,
                type: UserType.USER,
                role: { rolePermissions: [] }
            }))
        }
        const service = createMembershipService(
            {} as never,
            {} as never,
            {} as never,
            {} as never,
            {} as never,
            userRepository as never
        )
        const initialize = jest.spyOn(service, 'ensureScopeInitialized').mockResolvedValue({} as never)

        await expect(
            service.assertCanUse({
                tenantId: 'tenant-1',
                organizationId: 'org-1',
                copilotOrganizationId: 'org-1',
                userId: 'assistant-tech-user',
                provider: 'tongyi',
                model: 'qwen3.6-plus'
            })
        ).rejects.toThrow('Membership plan is required to use Copilot models.')
        expect(initialize).not.toHaveBeenCalled()
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

    it('queues organization initialization when no active organization plan exists', async () => {
        const {
            backfillQueueService,
            dataSource,
            ledgerRepository,
            memberships,
            membershipRepository,
            planRepository,
            plans,
            service
        } = createScopeInitializationHarness()

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
        expect(backfillQueueService.enqueueOrganizationDefaultMembershipBackfill).toHaveBeenCalledWith(
            'tenant-1',
            'org-1',
            'admin-1'
        )
    })

    it('does not queue organization initialization for an actor without membership edit permission', async () => {
        const { backfillQueueService, service } = createScopeInitializationHarness()

        await service.ensureScopeInitialized({
            tenantId: 'tenant-1',
            organizationId: 'org-1',
            assignedById: 'builder-1'
        })

        expect(backfillQueueService.enqueueOrganizationDefaultMembershipBackfill).not.toHaveBeenCalled()
    })

    it('queues new organization initialization only when effective Feature and actor permission are both enabled', async () => {
        const { backfillQueueService, service } = createScopeInitializationHarness()

        await expect(
            service.enqueueOrganizationDefaultMembershipInitialization({
                tenantId: 'tenant-1',
                organizationId: 'org-1',
                actorUserId: 'admin-1'
            })
        ).resolves.toBe(true)
        await expect(
            service.enqueueOrganizationDefaultMembershipInitialization({
                tenantId: 'tenant-1',
                organizationId: 'org-2',
                actorUserId: 'builder-1'
            })
        ).resolves.toBe(false)

        expect(backfillQueueService.enqueueOrganizationDefaultMembershipBackfill).toHaveBeenCalledTimes(1)
        expect(backfillQueueService.enqueueOrganizationDefaultMembershipBackfill).toHaveBeenCalledWith(
            'tenant-1',
            'org-1',
            'admin-1'
        )
    })

    it('does not queue new organization initialization when the effective Feature is disabled', async () => {
        const { backfillQueueService, service } = createScopeInitializationHarness(undefined, () => [
            { isEnabled: false }
        ])

        await expect(
            service.enqueueOrganizationDefaultMembershipInitialization({
                tenantId: 'tenant-1',
                organizationId: 'org-1',
                actorUserId: 'admin-1'
            })
        ).resolves.toBe(false)

        expect(backfillQueueService.enqueueOrganizationDefaultMembershipBackfill).not.toHaveBeenCalled()
    })

    it('initializes tenant scope by enqueueing an idempotent backfill', async () => {
        const { backfillQueueService, memberships, plans, service } = createScopeInitializationHarness()
        plans.push(createPlan({ id: 'plan-tenant-default' }))

        const firstStatus = await service.ensureScopeInitialized({
            tenantId: 'tenant-1',
            organizationId: null,
            assignedById: 'admin-1'
        })
        const secondStatus = await service.ensureScopeInitialized({
            tenantId: 'tenant-1',
            organizationId: null,
            assignedById: 'admin-1'
        })

        expect(firstStatus).toMatchObject({
            scope: 'tenant',
            initialized: true,
            activePlanCount: 1
        })
        expect(secondStatus).toMatchObject({
            scope: 'tenant',
            initialized: true,
            activePlanCount: 1
        })
        expect(backfillQueueService.enqueueTenantDefaultMembershipBackfill).toHaveBeenCalledTimes(2)
        expect(backfillQueueService.enqueueTenantDefaultMembershipBackfill).toHaveBeenNthCalledWith(1, 'tenant-1')
        expect(backfillQueueService.enqueueTenantDefaultMembershipBackfill).toHaveBeenNthCalledWith(2, 'tenant-1')
        expect(memberships).toHaveLength(0)
    })

    it('creates one default tenant plan before backfilling an empty tenant scope', async () => {
        const { plans, service, userRepository } = createScopeInitializationHarness()
        userRepository.find.mockResolvedValue([])

        const [firstResult, secondResult] = await Promise.all([
            service.backfillTenantDefaultMembershipBatch({
                tenantId: 'tenant-1'
            }),
            service.backfillTenantDefaultMembershipBatch({
                tenantId: 'tenant-1'
            })
        ])

        expect(plans).toEqual([
            expect.objectContaining({
                tenantId: 'tenant-1',
                organizationId: null,
                code: 'default',
                name: 'Default',
                status: MembershipPlanStatusEnum.Active,
                isDefault: true,
                period: MembershipPeriodEnum.Monthly,
                includedPoints: 1000,
                allowedModels: [],
                modelMultipliers: [],
                rateLimits: []
            })
        ])
        expect(firstResult).toEqual({ scanned: 0, assigned: 0, nextCursor: null })
        expect(secondResult).toEqual({ scanned: 0, assigned: 0, nextCursor: null })
    })

    it('queues inherited organizations in bounded batches after tenant membership Feature activation', async () => {
        const { backfillQueueService, organizationRepository, service } = createScopeInitializationHarness()

        const result = await service.backfillTenantOrganizationDefaultMembershipBatch({
            tenantId: 'tenant-1',
            actorUserId: 'admin-1',
            take: 1
        })

        expect(organizationRepository.find).toHaveBeenCalledWith({
            select: ['id'],
            where: {
                tenantId: 'tenant-1',
                isActive: true
            },
            order: { id: 'ASC' },
            take: 2
        })
        expect(backfillQueueService.enqueueOrganizationDefaultMembershipBackfill).toHaveBeenCalledWith(
            'tenant-1',
            'org-1',
            'admin-1'
        )
        expect(result).toEqual({ scanned: 1, enqueued: 1, nextCursor: 'org-1' })
    })

    it('creates one default organization plan and backfills active members idempotently', async () => {
        const { ledgers, memberships, plans, service } = createScopeInitializationHarness()

        const [firstResult, secondResult] = await Promise.all([
            service.backfillOrganizationDefaultMembershipBatch({
                tenantId: 'tenant-1',
                organizationId: 'org-1',
                actorUserId: 'admin-1'
            }),
            service.backfillOrganizationDefaultMembershipBatch({
                tenantId: 'tenant-1',
                organizationId: 'org-1',
                actorUserId: 'admin-1'
            })
        ])

        expect(plans).toEqual([
            expect.objectContaining({
                tenantId: 'tenant-1',
                organizationId: 'org-1',
                code: 'default',
                name: 'Default',
                status: MembershipPlanStatusEnum.Active,
                isDefault: true,
                period: MembershipPeriodEnum.Monthly,
                includedPoints: 1000,
                allowedModels: [],
                modelMultipliers: [],
                rateLimits: []
            })
        ])
        expect(memberships).toHaveLength(2)
        expect(memberships).toEqual(
            expect.arrayContaining([
                expect.objectContaining({
                    organizationId: 'org-1',
                    userId: 'user-1',
                    planId: 'plan-default',
                    source: MembershipSourceEnum.Organization
                }),
                expect.objectContaining({
                    organizationId: 'org-1',
                    userId: 'user-2',
                    planId: 'plan-default',
                    source: MembershipSourceEnum.Organization
                })
            ])
        )
        expect(ledgers).toHaveLength(2)
        expect(firstResult).toEqual({ scanned: 2, assigned: 2, nextCursor: null })
        expect(secondResult).toEqual({ scanned: 2, assigned: 0, nextCursor: null })
    })

    it('creates the organization default plan but skips members without membership use permission', async () => {
        const { ledgers, memberships, plans, service, userRepository } = createScopeInitializationHarness()
        userRepository.find.mockResolvedValue([
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
                role: { rolePermissions: [] }
            }
        ])

        const result = await service.backfillOrganizationDefaultMembershipBatch({
            tenantId: 'tenant-1',
            organizationId: 'org-1',
            actorUserId: 'admin-1'
        })

        expect(plans).toEqual([
            expect.objectContaining({
                organizationId: 'org-1',
                code: 'default',
                status: MembershipPlanStatusEnum.Active
            })
        ])
        expect(memberships).toEqual([
            expect.objectContaining({
                organizationId: 'org-1',
                userId: 'user-1',
                source: MembershipSourceEnum.Organization
            })
        ])
        expect(ledgers).toHaveLength(1)
        expect(result).toEqual({ scanned: 2, assigned: 1, nextCursor: null })
    })

    it('does not create an organization default plan when the triggering actor cannot edit membership plans', async () => {
        const { ledgers, memberships, plans, service, userRepository } = createScopeInitializationHarness()
        userRepository.findOne.mockImplementation(async ({ where }) => ({
            id: where.id,
            tenantId: where.tenantId,
            type: UserType.USER,
            role: {
                rolePermissions: [{ permission: AIPermissionsEnum.MEMBERSHIP_USE, enabled: true }]
            }
        }))

        const result = await service.backfillOrganizationDefaultMembershipBatch({
            tenantId: 'tenant-1',
            organizationId: 'org-1',
            actorUserId: 'builder-1'
        })

        expect(plans).toHaveLength(0)
        expect(memberships).toHaveLength(0)
        expect(ledgers).toHaveLength(0)
        expect(result).toEqual({ scanned: 0, assigned: 0, nextCursor: null })
    })

    it('does not assign a user who leaves the organization after the batch is scanned', async () => {
        const { memberships, service, userOrganizationRepository } = createScopeInitializationHarness()
        userOrganizationRepository.find
            .mockResolvedValueOnce([
                { id: 'user-organization-1', userId: 'user-1' },
                { id: 'user-organization-2', userId: 'user-2' }
            ])
            .mockResolvedValueOnce([{ id: 'user-organization-1', userId: 'user-1' }])

        const result = await service.backfillOrganizationDefaultMembershipBatch({
            tenantId: 'tenant-1',
            organizationId: 'org-1',
            actorUserId: 'admin-1'
        })

        expect(memberships).toEqual([
            expect.objectContaining({
                organizationId: 'org-1',
                userId: 'user-1'
            })
        ])
        expect(result).toEqual({ scanned: 2, assigned: 1, nextCursor: null })
    })

    it('does not replace an existing tenant plan when the scope has no default plan', async () => {
        const { memberships, plans, service } = createScopeInitializationHarness()
        plans.push(
            createPlan({
                id: 'plan-custom',
                code: 'custom',
                name: 'Custom',
                isDefault: false
            })
        )

        const result = await service.backfillTenantDefaultMembershipBatch({
            tenantId: 'tenant-1'
        })

        expect(plans).toEqual([
            expect.objectContaining({
                id: 'plan-custom',
                code: 'custom',
                name: 'Custom',
                isDefault: false
            })
        ])
        expect(memberships).toHaveLength(0)
        expect(result).toEqual({ scanned: 0, assigned: 0, nextCursor: null })
    })

    it('backfills one tenant batch without replacing existing memberships or repeating eligibility queries', async () => {
        const { memberships, membershipRepository, plans, service, userRepository } = createScopeInitializationHarness()
        plans.push(createPlan({ id: 'plan-tenant-default' }))
        memberships.push(
            createMembership({
                id: 'membership-manual',
                organizationId: null,
                userId: 'user-1',
                planId: 'plan-manual',
                source: MembershipSourceEnum.Admin
            })
        )
        userRepository.find.mockResolvedValueOnce([{ id: 'user-1' }, { id: 'user-2' }, { id: 'user-3' }])

        const result = await service.backfillTenantDefaultMembershipBatch({
            tenantId: 'tenant-1',
            take: 2
        })

        expect(memberships).toHaveLength(2)
        expect(memberships).toContainEqual(
            expect.objectContaining({
                id: 'membership-manual',
                userId: 'user-1',
                planId: 'plan-manual',
                source: MembershipSourceEnum.Admin
            })
        )
        expect(memberships).toContainEqual(
            expect.objectContaining({
                userId: 'user-2',
                planId: 'plan-tenant-default',
                source: MembershipSourceEnum.TenantDefault
            })
        )
        expect(membershipRepository.save).toHaveBeenCalledTimes(1)
        expect(userRepository.findOne).not.toHaveBeenCalled()
        expect(result).toEqual({
            scanned: 2,
            assigned: 1,
            nextCursor: 'user-2'
        })
    })

    it('queues organization initialization when only archived organization plans exist', async () => {
        const {
            backfillQueueService,
            dataSource,
            ledgerRepository,
            memberships,
            membershipRepository,
            planRepository,
            plans,
            service
        } = createScopeInitializationHarness()
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
        expect(backfillQueueService.enqueueOrganizationDefaultMembershipBackfill).toHaveBeenCalledWith(
            'tenant-1',
            'org-1',
            'admin-1'
        )
    })

    it('does not count or promote a catalog clone as the organization default plan', async () => {
        const { backfillQueueService, plans, service } = createScopeInitializationHarness()
        const catalogClone = createPlan({
            id: 'catalog-clone',
            organizationId: 'org-1',
            code: 'catalog-paid',
            isDefault: false,
            catalogSourcePlanId: 'catalog-plan'
        })
        plans.push(catalogClone)

        const beforeBackfill = await service.ensureScopeInitialized({
            tenantId: 'tenant-1',
            organizationId: 'org-1',
            assignedById: 'admin-1'
        })
        await service.backfillOrganizationDefaultMembershipBatch({
            tenantId: 'tenant-1',
            organizationId: 'org-1',
            actorUserId: 'admin-1'
        })
        const afterBackfill = await service.getScopeStatus({
            tenantId: 'tenant-1',
            organizationId: 'org-1'
        })

        expect(beforeBackfill).toMatchObject({
            planCount: 0,
            activePlanCount: 0,
            defaultPlan: null
        })
        expect(backfillQueueService.enqueueOrganizationDefaultMembershipBackfill).toHaveBeenCalledWith(
            'tenant-1',
            'org-1',
            'admin-1'
        )
        expect(catalogClone.isDefault).toBe(false)
        expect(plans).toEqual(
            expect.arrayContaining([
                expect.objectContaining({
                    id: 'plan-default',
                    organizationId: 'org-1',
                    code: 'default',
                    isDefault: true
                })
            ])
        )
        expect(afterBackfill).toMatchObject({
            planCount: 1,
            activePlanCount: 1,
            defaultPlan: expect.objectContaining({ id: 'plan-default' })
        })
    })

    it('self-heals a missing active period projection for an organization membership', async () => {
        const { memberships, periods, plans, service } = createScopeInitializationHarness()
        const plan = createPlan({
            id: 'organization-free',
            organizationId: 'org-1',
            level: 0
        })
        plans.push(plan)
        memberships.push(
            createMembership({
                id: 'membership-free',
                organizationId: 'org-1',
                userId: 'user-1',
                planId: plan.id,
                plan,
                source: MembershipSourceEnum.Organization
            })
        )

        const first = await service.ensureActiveMembershipPeriod({
            tenantId: 'tenant-1',
            organizationId: 'org-1',
            userId: 'user-1',
            membershipId: 'membership-free'
        })
        const second = await service.ensureActiveMembershipPeriod({
            tenantId: 'tenant-1',
            organizationId: 'org-1',
            userId: 'user-1',
            membershipId: 'membership-free'
        })

        expect(first.id).toBe(second.id)
        expect(periods).toHaveLength(1)
        expect(periods[0]).toMatchObject({
            membershipId: 'membership-free',
            planId: plan.id,
            status: MembershipPeriodStatusEnum.Active,
            source: MembershipSourceEnum.Organization
        })
    })

    it('reactivates an archived Default organization plan and backfills active members idempotently', async () => {
        const { memberships, planRepository, plans, service } = createScopeInitializationHarness()
        const archivedPlan = {
            id: 'plan-archived',
            tenantId: 'tenant-1',
            organizationId: 'org-1',
            code: 'default',
            name: 'Default',
            status: MembershipPlanStatusEnum.Archived,
            isDefault: false,
            period: MembershipPeriodEnum.Monthly,
            includedPoints: 1000,
            allowedModels: [],
            modelMultipliers: [],
            rateLimits: []
        } as MembershipPlan
        plans.push(archivedPlan)
        memberships.push(
            createMembership({
                id: 'membership-expired',
                organizationId: 'org-1',
                userId: 'user-1',
                status: MembershipStatusEnum.Expired,
                planId: archivedPlan.id,
                plan: archivedPlan
            })
        )

        const firstResult = await service.backfillOrganizationDefaultMembershipBatch({
            tenantId: 'tenant-1',
            organizationId: 'org-1',
            actorUserId: 'admin-1'
        })
        const secondResult = await service.backfillOrganizationDefaultMembershipBatch({
            tenantId: 'tenant-1',
            organizationId: 'org-1',
            actorUserId: 'admin-1'
        })

        expect(plans).toEqual([
            expect.objectContaining({
                id: 'plan-archived',
                code: 'default',
                name: 'Default',
                status: MembershipPlanStatusEnum.Active,
                isDefault: true
            })
        ])
        expect(memberships).toHaveLength(3)
        expect(memberships).toEqual(
            expect.arrayContaining([
                expect.objectContaining({
                    id: 'membership-expired',
                    userId: 'user-1',
                    status: MembershipStatusEnum.Expired
                }),
                expect.objectContaining({
                    userId: 'user-1',
                    status: MembershipStatusEnum.Active,
                    planId: 'plan-archived'
                }),
                expect.objectContaining({
                    userId: 'user-2',
                    status: MembershipStatusEnum.Active,
                    planId: 'plan-archived'
                })
            ])
        )
        expect(planRepository.save).toHaveBeenCalledTimes(1)
        expect(firstResult).toEqual({ scanned: 2, assigned: 2, nextCursor: null })
        expect(secondResult).toEqual({ scanned: 2, assigned: 0, nextCursor: null })
    })

    it('keeps archived organization plans and creates one active Default plan for backfill', async () => {
        const { memberships, plans, service } = createScopeInitializationHarness()
        plans.push({
            id: 'plan-archived',
            tenantId: 'tenant-1',
            organizationId: 'org-1',
            code: 'legacy',
            name: 'Legacy',
            status: MembershipPlanStatusEnum.Archived,
            isDefault: false,
            period: MembershipPeriodEnum.Monthly,
            includedPoints: 500,
            allowedModels: [],
            modelMultipliers: [],
            rateLimits: []
        } as MembershipPlan)

        const result = await service.backfillOrganizationDefaultMembershipBatch({
            tenantId: 'tenant-1',
            organizationId: 'org-1',
            actorUserId: 'admin-1'
        })

        expect(plans).toEqual(
            expect.arrayContaining([
                expect.objectContaining({
                    id: 'plan-archived',
                    code: 'legacy',
                    status: MembershipPlanStatusEnum.Archived,
                    isDefault: false
                }),
                expect.objectContaining({
                    code: 'default',
                    name: 'Default',
                    status: MembershipPlanStatusEnum.Active,
                    isDefault: true
                })
            ])
        )
        expect(plans).toHaveLength(2)
        expect(memberships).toHaveLength(2)
        expect(result).toEqual({ scanned: 2, assigned: 2, nextCursor: null })
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
            isDefault: true,
            status: MembershipPlanStatusEnum.Active
        })
        expect(memberships).toHaveLength(2)
        expect(membershipRepository.save).toHaveBeenCalledTimes(2)
        expect(ledgerRepository.save).toHaveBeenCalledTimes(2)
        expect(ledgerRepository.save).toHaveBeenCalledWith(expect.objectContaining({ pointsDelta: 500 }))
        expect(planRepository.save).toHaveBeenCalledTimes(1)
    })

    it('preserves paused and revoked records while filling missing active organization memberships', async () => {
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
            MembershipStatusEnum.Expired,
            MembershipStatusEnum.Active
        ])
        expect(memberships[2]).toMatchObject({
            userId: 'user-2',
            planId: plan.id,
            source: MembershipSourceEnum.Organization
        })
        expect(membershipRepository.save).toHaveBeenCalledTimes(1)
        expect(ledgerRepository.save).toHaveBeenCalledTimes(1)
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
            tokenUsed: 2500,
            settlementAmount: 0.25,
            settlementCurrency: 'CNY'
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

    it('rejects usage when xpert has no creator instead of billing the runtime user', async () => {
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
        const findUsableMembership = jest.spyOn(getMembershipServiceTestAccess(service), 'findUsableMembership')

        await expect(
            service.assertCanUse({
                tenantId: 'tenant-1',
                userId: 'assistant-tech-user',
                xpertId: 'xpert-1'
            })
        ).rejects.toThrow('The Xpert creator is required')

        expect(findUsableMembership).not.toHaveBeenCalled()
    })

    it('rejects usage when the referenced xpert no longer exists', async () => {
        const xpertRepository = {
            findOne: jest.fn().mockResolvedValue(null)
        }
        const service = createMembershipService(
            {} as never,
            {} as never,
            {} as never,
            {} as never,
            xpertRepository as never
        )

        await expect(
            service.resolveBillableUserId({
                tenantId: 'tenant-1',
                userId: 'assistant-tech-user',
                xpertId: 'missing-xpert'
            })
        ).rejects.toThrow('The Xpert creator is required')
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
            tokenUsed: 1000,
            settlementAmount: 0.1,
            settlementCurrency: 'CNY'
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
                tokenUsed: 1000,
                settlementAmount: 0.1,
                settlementCurrency: 'CNY'
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

    it('allows tenant copilots for an organization membership purchased from the tenant catalog', async () => {
        const service = createMembershipService({} as never, {} as never, {} as never, {} as never, {} as never)
        const membership = createMembership({
            organizationId: 'org-1',
            pointsUsed: 0,
            source: MembershipSourceEnum.External,
            plan: {
                ...createMembership().plan,
                organizationId: 'org-1',
                catalogSourcePlanId: 'tenant-catalog-plan'
            }
        } as never)
        jest.spyOn(service, 'findModelAccess').mockResolvedValue({
            tenantId: 'tenant-1',
            organizationId: 'org-1',
            membership
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
        ).resolves.toBeUndefined()
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
            currentPeriodEnd: new Date(Date.now() + 24 * 60 * 60 * 1000),
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

    it('records monetary usage for unlimited memberships', async () => {
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
                name: MEMBERSHIP_CNY_PER_POINT_SETTING,
                value: '0.25'
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
                includedPoints: null,
                modelMultipliers: [{ provider: 'tongyi', model: 'qwen3.6-plus', multiplier: 2 }]
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
            tokenUsed: 2500,
            settlementAmount: 0.025,
            settlementCurrency: 'CNY'
        })

        expect(membershipRepository.save).toHaveBeenCalledWith(expect.objectContaining({ pointsUsed: 99.2 }))
        expect(createLedger).toHaveBeenCalledWith(
            manager,
            expect.objectContaining({
                pointsDelta: -0.2,
                tokenUsed: 2500,
                organizationId: 'org-1',
                settlementAmount: 0.05
            })
        )
        expect(ledger).toMatchObject({ pointsDelta: -0.2, tokenUsed: 2500, settlementAmount: 0.05 })
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
            tokenUsed: 1000,
            settlementAmount: 0.1,
            settlementCurrency: 'CNY'
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

    it('does not overdraw membership points when personal points cannot cover the remainder', async () => {
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
        jest.spyOn(getMembershipServiceTestAccess(service), 'getPersonalPointsBalance').mockResolvedValue(0.25)
        const createLedger = jest
            .spyOn(getMembershipServiceTestAccess(service), 'createLedger')
            .mockImplementation(async (_manager, input) => input as MembershipPointLedger)

        await expect(
            service.recordUsage({
                tenantId: 'tenant-1',
                userId: membership.userId,
                provider: 'tongyi',
                model: 'qwen3.6-plus',
                tokenUsed: 1000,
                settlementAmount: 0.1,
                settlementCurrency: 'CNY'
            })
        ).rejects.toThrow('Membership points limit exceeded.')

        expect(membershipRepository.save).toHaveBeenCalledWith(expect.objectContaining({ pointsUsed: 10 }))
        expect(createLedger).toHaveBeenNthCalledWith(
            1,
            manager,
            expect.objectContaining({
                pointsDelta: -0.5,
                tokenUsed: 1000
            })
        )
        expect(createLedger).toHaveBeenNthCalledWith(
            2,
            manager,
            expect.objectContaining({
                source: MembershipLedgerSourceEnum.PersonalUsage,
                pointsDelta: -0.25,
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

    it('keeps the latest membership visible when the membership feature is disabled', async () => {
        jest.spyOn(RequestContext, 'currentTenantId').mockReturnValue('tenant-1')
        jest.spyOn(RequestContext, 'getOrganizationId').mockReturnValue('org-1')
        jest.spyOn(RequestContext, 'currentUserId').mockReturnValue('owner-user')
        const membership = createMembership({
            organizationId: 'org-1',
            status: MembershipStatusEnum.Expired
        })
        const service = createMembershipService(
            {} as never,
            {} as never,
            {} as never,
            {} as never,
            {} as never,
            undefined,
            undefined,
            undefined,
            createMembershipFeatureRepository(() => [{ isEnabled: false }]).repository as never
        )
        jest.spyOn(service, 'findModelAccess').mockResolvedValue(null)
        const internals = getMembershipServiceTestAccess(service)
        jest.spyOn(internals, 'findMembershipForUpdate').mockResolvedValue(membership)
        jest.spyOn(internals, 'getPersonalPointsBalance').mockResolvedValue(0)

        await expect(service.getMe()).resolves.toMatchObject({
            membership,
            plan: membership.plan,
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
            tokenUsed: 1000,
            settlementAmount: 0.1,
            settlementCurrency: 'CNY'
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

    it('rejects manually assigning a catalog-managed organization plan', async () => {
        jest.spyOn(RequestContext, 'currentTenantId').mockReturnValue('tenant-1')
        jest.spyOn(RequestContext, 'getOrganizationId').mockReturnValue('org-1')
        jest.spyOn(RequestContext, 'currentUserId').mockReturnValue('admin-1')
        const { plans, service } = createScopeInitializationHarness()
        plans.push(
            createPlan({
                id: 'catalog-clone',
                organizationId: 'org-1',
                catalogSourcePlanId: 'catalog-plan'
            })
        )

        await expect(service.assignUser('user-1', { planId: 'catalog-clone' })).rejects.toThrow(
            'Membership plan not found.'
        )
    })

    it('does not let admin assignment overwrite a purchased membership', async () => {
        jest.spyOn(RequestContext, 'currentTenantId').mockReturnValue('tenant-1')
        jest.spyOn(RequestContext, 'getOrganizationId').mockReturnValue('org-1')
        jest.spyOn(RequestContext, 'currentUserId').mockReturnValue('admin-1')
        const { memberships, plans, service } = createScopeInitializationHarness()
        const targetPlan = createPlan({
            id: 'managed-plan',
            organizationId: 'org-1'
        })
        const paidPlan = createPlan({
            id: 'catalog-clone',
            organizationId: 'org-1',
            catalogSourcePlanId: 'catalog-plan'
        })
        plans.push(targetPlan, paidPlan)
        memberships.push(
            createMembership({
                id: 'paid-membership',
                organizationId: 'org-1',
                userId: 'user-1',
                planId: paidPlan.id,
                plan: paidPlan,
                source: MembershipSourceEnum.External
            })
        )

        await expect(service.assignUser('user-1', { planId: targetPlan.id })).rejects.toThrow(
            'Purchased memberships must be renewed through billing.'
        )
        expect(memberships[0]).toMatchObject({
            planId: paidPlan.id,
            source: MembershipSourceEnum.External
        })
    })

    it('synchronizes the active period before queuing a renewal after assigning a plan', async () => {
        jest.spyOn(RequestContext, 'currentTenantId').mockReturnValue('tenant-1')
        jest.spyOn(RequestContext, 'getOrganizationId').mockReturnValue(null)
        jest.spyOn(RequestContext, 'currentUserId').mockReturnValue('admin-1')
        const { memberships, periods, plans, service } = createScopeInitializationHarness()
        const oldPlan = createPlan({ id: 'plan-old', name: 'Old plan', includedPoints: 100 })
        const targetPlan = createPlan({ id: 'plan-target', name: 'Target plan', includedPoints: 300 })
        plans.push(oldPlan, targetPlan)
        const membership = createMembership({
            id: 'membership-reassigned',
            userId: 'user-1',
            planId: oldPlan.id,
            plan: oldPlan,
            currentPeriodStart: new Date('2030-07-10T00:00:00.000Z'),
            currentPeriodEnd: new Date('2030-08-10T00:00:00.000Z'),
            pointsGranted: 100,
            pointsUsed: 40
        })
        memberships.push(membership)
        periods.push({
            id: 'period-active-old',
            tenantId: 'tenant-1',
            organizationId: null,
            membershipId: membership.id,
            userId: membership.userId,
            planId: oldPlan.id,
            plan: oldPlan,
            status: MembershipPeriodStatusEnum.Active,
            periodStart: membership.currentPeriodStart,
            periodEnd: membership.currentPeriodEnd,
            pointsGranted: 100,
            pointsUsed: 40,
            source: MembershipSourceEnum.Admin,
            renewalMode: MembershipRenewalModeEnum.Auto,
            sourceReference: null,
            sourceSequence: 0,
            planSnapshot: {
                planId: oldPlan.id,
                code: oldPlan.code,
                name: oldPlan.name,
                description: null,
                period: oldPlan.period,
                includedPoints: oldPlan.includedPoints,
                allowedModels: oldPlan.allowedModels,
                modelMultipliers: oldPlan.modelMultipliers,
                rateLimits: oldPlan.rateLimits
            }
        } as MembershipPeriod)

        await service.assignUser('user-1', {
            planId: targetPlan.id,
            currentPeriodStart: '2030-07-20T00:00:00.000Z',
            currentPeriodEnd: '2030-09-20T00:00:00.000Z',
            renewalMode: MembershipRenewalModeEnum.Manual
        })
        await service.appendMembershipPeriods({
            tenantId: 'tenant-1',
            userId: 'user-1',
            planId: targetPlan.id,
            count: 1,
            source: MembershipSourceEnum.Admin,
            renewalMode: MembershipRenewalModeEnum.Manual
        })

        expect(periods.find(({ status }) => status === MembershipPeriodStatusEnum.Active)).toMatchObject({
            planId: targetPlan.id,
            periodStart: new Date('2030-07-20T00:00:00.000Z'),
            periodEnd: new Date('2030-09-20T00:00:00.000Z'),
            pointsGranted: 300,
            pointsUsed: 0,
            renewalMode: MembershipRenewalModeEnum.Manual,
            planSnapshot: {
                planId: targetPlan.id,
                name: targetPlan.name,
                includedPoints: targetPlan.includedPoints
            }
        })
        expect(periods.find(({ status }) => status === MembershipPeriodStatusEnum.Scheduled)).toMatchObject({
            planId: targetPlan.id,
            periodStart: new Date('2030-09-20T00:00:00.000Z')
        })
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

    it('rejects admin renewal of a purchased membership', async () => {
        jest.spyOn(RequestContext, 'currentTenantId').mockReturnValue('tenant-1')
        jest.spyOn(RequestContext, 'getOrganizationId').mockReturnValue('org-1')
        const { memberships, periods, plans, service } = createScopeInitializationHarness()
        const paidPlan = createPlan({
            id: 'catalog-clone',
            organizationId: 'org-1',
            catalogSourcePlanId: 'catalog-plan'
        })
        plans.push(paidPlan)
        memberships.push(
            createMembership({
                id: 'paid-membership',
                organizationId: 'org-1',
                userId: 'user-1',
                planId: paidPlan.id,
                plan: paidPlan,
                source: MembershipSourceEnum.External
            })
        )

        await expect(service.renewUser('user-1')).rejects.toThrow(
            'Purchased memberships must be renewed through billing.'
        )
        expect(periods).toHaveLength(0)
    })

    it('does not renew an expired purchased membership when resuming it', async () => {
        jest.spyOn(RequestContext, 'currentTenantId').mockReturnValue('tenant-1')
        jest.spyOn(RequestContext, 'getOrganizationId').mockReturnValue('org-1')
        const { memberships, periods, plans, service } = createScopeInitializationHarness()
        const paidPlan = createPlan({
            id: 'catalog-clone',
            organizationId: 'org-1',
            catalogSourcePlanId: 'catalog-plan'
        })
        plans.push(paidPlan)
        memberships.push(
            createMembership({
                id: 'paused-paid-membership',
                organizationId: 'org-1',
                userId: 'user-1',
                planId: paidPlan.id,
                plan: paidPlan,
                source: MembershipSourceEnum.External,
                status: MembershipStatusEnum.Paused,
                currentPeriodStart: new Date('2020-06-01T00:00:00.000Z'),
                currentPeriodEnd: new Date('2020-07-01T00:00:00.000Z')
            })
        )

        await expect(service.resumeUser('user-1')).rejects.toThrow(
            'Purchased memberships must be renewed through billing.'
        )
        expect(periods.filter(({ status }) => status === MembershipPeriodStatusEnum.Scheduled)).toHaveLength(0)
    })

    it('activates a paid scheduled period when resuming after the current period expired', async () => {
        jest.spyOn(RequestContext, 'currentTenantId').mockReturnValue('tenant-1')
        jest.spyOn(RequestContext, 'getOrganizationId').mockReturnValue('org-1')
        const { memberships, periods, plans, service } = createScopeInitializationHarness()
        const paidPlan = createPlan({
            id: 'catalog-clone',
            organizationId: 'org-1',
            catalogSourcePlanId: 'catalog-plan',
            level: 1
        })
        const snapshot = {
            planId: paidPlan.id,
            code: paidPlan.code,
            name: paidPlan.name,
            description: null,
            level: paidPlan.level,
            catalogSourcePlanId: paidPlan.catalogSourcePlanId,
            period: paidPlan.period,
            includedPoints: paidPlan.includedPoints,
            allowedModels: [],
            modelMultipliers: [],
            rateLimits: []
        }
        plans.push(paidPlan)
        memberships.push(
            createMembership({
                id: 'paused-paid-membership',
                organizationId: 'org-1',
                userId: 'user-1',
                planId: paidPlan.id,
                plan: paidPlan,
                planSnapshot: snapshot,
                source: MembershipSourceEnum.External,
                status: MembershipStatusEnum.Paused,
                currentPeriodStart: new Date('2020-06-01T00:00:00.000Z'),
                currentPeriodEnd: new Date('2020-07-01T00:00:00.000Z')
            })
        )
        periods.push(
            {
                id: 'expired-period',
                tenantId: 'tenant-1',
                organizationId: 'org-1',
                membershipId: 'paused-paid-membership',
                userId: 'user-1',
                planId: paidPlan.id,
                status: MembershipPeriodStatusEnum.Active,
                periodStart: new Date('2020-06-01T00:00:00.000Z'),
                periodEnd: new Date('2020-07-01T00:00:00.000Z'),
                pointsGranted: 100,
                pointsUsed: 10,
                source: MembershipSourceEnum.External,
                renewalMode: MembershipRenewalModeEnum.Manual,
                sourceReference: 'order-paid',
                sourceSequence: 0,
                planSnapshot: snapshot
            } as MembershipPeriod,
            {
                id: 'paid-scheduled-period',
                tenantId: 'tenant-1',
                organizationId: 'org-1',
                membershipId: 'paused-paid-membership',
                userId: 'user-1',
                planId: paidPlan.id,
                status: MembershipPeriodStatusEnum.Scheduled,
                periodStart: new Date('2020-07-01T00:00:00.000Z'),
                periodEnd: new Date('2030-07-01T00:00:00.000Z'),
                pointsGranted: 100,
                pointsUsed: 0,
                source: MembershipSourceEnum.External,
                renewalMode: MembershipRenewalModeEnum.Manual,
                sourceReference: 'order-paid',
                sourceSequence: 1,
                planSnapshot: snapshot
            } as MembershipPeriod
        )

        const resumed = await service.resumeUser('user-1')

        expect(resumed).toMatchObject({
            status: MembershipStatusEnum.Active,
            currentPeriodEnd: new Date('2030-07-01T00:00:00.000Z'),
            source: MembershipSourceEnum.External
        })
        expect(periods).toEqual(
            expect.arrayContaining([
                expect.objectContaining({
                    id: 'expired-period',
                    status: MembershipPeriodStatusEnum.Completed
                }),
                expect.objectContaining({
                    id: 'paid-scheduled-period',
                    status: MembershipPeriodStatusEnum.Active
                })
            ])
        )
    })

    it('revokes a paid membership while preserving future periods for billing refunds', async () => {
        jest.spyOn(RequestContext, 'currentTenantId').mockReturnValue('tenant-1')
        jest.spyOn(RequestContext, 'getOrganizationId').mockReturnValue('org-1')
        const { memberships, periods, plans, service } = createScopeInitializationHarness()
        const paidPlan = createPlan({
            id: 'catalog-clone',
            organizationId: 'org-1',
            catalogSourcePlanId: 'catalog-plan',
            level: 1
        })
        const snapshot = {
            planId: paidPlan.id,
            code: paidPlan.code,
            name: paidPlan.name,
            description: null,
            level: paidPlan.level,
            catalogSourcePlanId: paidPlan.catalogSourcePlanId,
            period: paidPlan.period,
            includedPoints: paidPlan.includedPoints,
            allowedModels: [],
            modelMultipliers: [],
            rateLimits: []
        }
        plans.push(paidPlan)
        memberships.push(
            createMembership({
                id: 'paid-membership',
                organizationId: 'org-1',
                userId: 'user-1',
                planId: paidPlan.id,
                plan: paidPlan,
                planSnapshot: snapshot,
                source: MembershipSourceEnum.External,
                renewalMode: MembershipRenewalModeEnum.Manual
            })
        )
        periods.push(
            {
                id: 'current-paid-period',
                tenantId: 'tenant-1',
                organizationId: 'org-1',
                membershipId: 'paid-membership',
                userId: 'user-1',
                planId: paidPlan.id,
                status: MembershipPeriodStatusEnum.Active,
                periodStart: new Date('2026-07-01T00:00:00.000Z'),
                periodEnd: new Date('2026-08-01T00:00:00.000Z'),
                pointsGranted: 100,
                pointsUsed: 10,
                source: MembershipSourceEnum.External,
                renewalMode: MembershipRenewalModeEnum.Manual,
                sourceReference: 'order-paid',
                sourceSequence: 0,
                planSnapshot: snapshot
            } as MembershipPeriod,
            {
                id: 'future-paid-period',
                tenantId: 'tenant-1',
                organizationId: 'org-1',
                membershipId: 'paid-membership',
                userId: 'user-1',
                planId: paidPlan.id,
                status: MembershipPeriodStatusEnum.Scheduled,
                periodStart: new Date('2030-08-01T00:00:00.000Z'),
                periodEnd: new Date('2030-09-01T00:00:00.000Z'),
                pointsGranted: 100,
                pointsUsed: 0,
                source: MembershipSourceEnum.External,
                renewalMode: MembershipRenewalModeEnum.Manual,
                sourceReference: 'order-paid',
                sourceSequence: 1,
                planSnapshot: snapshot
            } as MembershipPeriod
        )

        const revoked = await service.revokeUser('user-1')
        expect(revoked.status).toBe(MembershipStatusEnum.Expired)
        expect(periods.find(({ id }) => id === 'future-paid-period')).toMatchObject({
            status: MembershipPeriodStatusEnum.Scheduled
        })

        const reserved = await service.reserveFutureMembershipPeriodsForRefund({
            tenantId: 'tenant-1',
            organizationId: 'org-1',
            userId: 'user-1',
            sourceReference: 'order-paid'
        })

        expect(reserved).toEqual([
            expect.objectContaining({
                id: 'future-paid-period',
                status: MembershipPeriodStatusEnum.RefundPending
            })
        ])
        expect(periods.find(({ id }) => id === 'current-paid-period')).toMatchObject({
            status: MembershipPeriodStatusEnum.Completed
        })
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

    it('queues externally purchased renewal periods after a paused live period without consuming it', async () => {
        const { memberships, periods, plans, service } = createScopeInitializationHarness()
        const plan = createPlan({ id: 'plan-paused-purchase', includedPoints: 100 })
        plans.push(plan)
        const membership = createMembership({
            id: 'membership-paused-purchase',
            userId: 'user-1',
            planId: plan.id,
            plan,
            status: MembershipStatusEnum.Paused,
            source: MembershipSourceEnum.External,
            renewalMode: MembershipRenewalModeEnum.Manual,
            currentPeriodStart: new Date('2030-07-01T00:00:00.000Z'),
            currentPeriodEnd: new Date('2030-08-01T00:00:00.000Z'),
            pointsUsed: 25
        })
        memberships.push(membership)
        periods.push({
            id: 'paused-live-period',
            tenantId: 'tenant-1',
            organizationId: null,
            membershipId: membership.id,
            userId: 'user-1',
            planId: plan.id,
            status: MembershipPeriodStatusEnum.Active,
            periodStart: membership.currentPeriodStart,
            periodEnd: membership.currentPeriodEnd,
            pointsGranted: 100,
            pointsUsed: 25,
            source: MembershipSourceEnum.External,
            renewalMode: MembershipRenewalModeEnum.Manual,
            sourceReference: 'original-order',
            sourceSequence: 0,
            planSnapshot: {
                planId: plan.id,
                code: plan.code,
                name: plan.name,
                description: plan.description,
                level: plan.level,
                catalogSourcePlanId: plan.catalogSourcePlanId,
                period: plan.period,
                includedPoints: plan.includedPoints,
                allowedModels: plan.allowedModels,
                modelMultipliers: plan.modelMultipliers,
                rateLimits: plan.rateLimits
            }
        } as MembershipPeriod)

        const appended = await service.appendMembershipPeriods({
            tenantId: 'tenant-1',
            userId: 'user-1',
            planId: plan.id,
            count: 1,
            source: MembershipSourceEnum.External,
            sourceReference: 'renewal-order'
        })

        expect(membership).toMatchObject({
            status: MembershipStatusEnum.Paused,
            currentPeriodStart: new Date('2030-07-01T00:00:00.000Z'),
            currentPeriodEnd: new Date('2030-08-01T00:00:00.000Z'),
            pointsUsed: 25
        })
        expect(periods.find(({ id }) => id === 'paused-live-period')).toMatchObject({
            status: MembershipPeriodStatusEnum.Active,
            periodEnd: new Date('2030-08-01T00:00:00.000Z'),
            pointsUsed: 25
        })
        expect(appended).toEqual([
            expect.objectContaining({
                status: MembershipPeriodStatusEnum.Scheduled,
                periodStart: new Date('2030-08-01T00:00:00.000Z'),
                periodEnd: new Date('2030-09-01T00:00:00.000Z')
            })
        ])
    })

    it('appends multiple idempotent periods with immutable plan snapshots', async () => {
        const { ledgers, periods, plans, service } = createScopeInitializationHarness()
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
            sourceReference: 'order-1',
            actorId: 'buyer-1'
        })
        plan.name = 'Changed plan'
        plan.includedPoints = 9999
        const repeatedResult = await service.appendMembershipPeriods({
            tenantId: 'tenant-1',
            userId: 'user-1',
            planId: plan.id,
            count: 3,
            source: MembershipSourceEnum.External,
            sourceReference: 'order-1',
            actorId: 'buyer-1'
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
        expect(ledgers).toEqual(
            expect.arrayContaining([
                expect.objectContaining({ actorId: 'buyer-1', reason: 'Membership period activated' }),
                expect.objectContaining({ actorId: 'buyer-1', reason: '3 membership periods scheduled' })
            ])
        )
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
        const { ledgers, memberships, periods, plans, service } = createScopeInitializationHarness()
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
            sourceReference: 'upgrade-1',
            actorId: 'buyer-1'
        })
        const repeated = await service.upgradeCurrentMembershipPeriod({
            tenantId: 'tenant-1',
            userId: 'user-1',
            planId: proPlan.id,
            pointsDelta: 1200,
            sourceReference: 'upgrade-1',
            actorId: 'buyer-1'
        })

        expect(upgraded.plan.name).toBe('Pro')
        expect(upgraded.pointsGranted).toBe(2200)
        expect(repeated.pointsGranted).toBe(2200)
        expect(memberships).toHaveLength(1)
        expect(periods.find(({ status }) => status === MembershipPeriodStatusEnum.Active)).toMatchObject({
            sourceReference: 'upgrade-1',
            planSnapshot: {
                name: 'Pro'
            }
        })
        expect(periods.find(({ status }) => status === MembershipPeriodStatusEnum.Scheduled)?.planSnapshot.name).toBe(
            'Plus'
        )
        expect(ledgers).toContainEqual(
            expect.objectContaining({
                actorId: 'buyer-1',
                source: MembershipLedgerSourceEnum.Upgrade,
                sourceReference: 'upgrade-1'
            })
        )
    })

    it('preserves unlimited current-period points when upgrading to a finite plan', async () => {
        const { periods, plans, service } = createScopeInitializationHarness()
        const unlimitedPlan = createPlan({
            id: 'plan-unlimited',
            name: 'Unlimited',
            includedPoints: null
        })
        const finitePlan = createPlan({
            id: 'plan-finite',
            name: 'Finite',
            includedPoints: 5000
        })
        plans.push(unlimitedPlan, finitePlan)

        await service.appendMembershipPeriods({
            tenantId: 'tenant-1',
            userId: 'user-1',
            planId: unlimitedPlan.id,
            count: 1,
            sourceReference: 'order-unlimited'
        })
        const upgraded = await service.upgradeCurrentMembershipPeriod({
            tenantId: 'tenant-1',
            userId: 'user-1',
            planId: finitePlan.id,
            pointsDelta: 0,
            sourceReference: 'upgrade-finite'
        })

        expect(upgraded.pointsGranted).toBeNull()
        expect(periods.find(({ status }) => status === MembershipPeriodStatusEnum.Active)).toMatchObject({
            pointsGranted: null,
            sourceReference: 'upgrade-finite'
        })
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

    it('rejects invalid settlement amount multiplier and rate-limit plan rules', async () => {
        jest.spyOn(RequestContext, 'currentTenantId').mockReturnValue('tenant-1')
        jest.spyOn(RequestContext, 'getOrganizationId').mockReturnValue(null)
        const { service } = createScopeInitializationHarness()

        await expect(
            service.createPlan({
                code: 'bad-multiplier',
                name: 'Bad multiplier',
                modelMultipliers: [{ model: '*', multiplier: Number.NaN }]
            })
        ).rejects.toThrow('Each settlement amount multiplier must be a non-negative number.')
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

    it('charges gateway usage to membership first, then personal points, and records excess without debt', async () => {
        const membership = createMembership({ pointsGranted: 10, pointsUsed: 9.5 })
        const ledgerRepository = {
            find: jest.fn().mockResolvedValue([])
        }
        const membershipRepository = {
            save: jest.fn(async (value) => value)
        }
        const manager = {
            connection: { options: { type: 'sqlite' } },
            getRepository: jest.fn((entity) => {
                if (entity === MembershipPointLedger) {
                    return ledgerRepository
                }
                if (entity === UserMembership) {
                    return membershipRepository
                }
                throw new Error('Unexpected repository')
            })
        }
        const dataSource = {
            transaction: jest.fn((run: (transactionManager: typeof manager) => Promise<unknown>) => run(manager))
        }
        const service = createMembershipService(
            dataSource as never,
            {} as never,
            membershipRepository as never,
            ledgerRepository as never,
            {} as never
        )
        const access = getMembershipServiceTestAccess(service)
        jest.spyOn(access, 'acquireGatewayRequestLock').mockResolvedValue(undefined)
        jest.spyOn(access, 'resolveTenantCnyPerPoint').mockResolvedValue(DEFAULT_MEMBERSHIP_CNY_PER_POINT)
        const findModelAccessSpy = jest.spyOn(access, 'findModelAccessWithOrganizationSelfHeal').mockResolvedValue({
            tenantId: 'tenant-1',
            organizationId: 'org-1',
            membership,
            personalPointsOnly: false
        })
        jest.spyOn(access, 'getPersonalPointsBalance').mockResolvedValue(0.25)
        jest.spyOn(access, 'synchronizeCurrentPeriodProjection').mockResolvedValue(undefined)
        const createdLedgers: Array<Partial<MembershipPointLedger>> = []
        jest.spyOn(access, 'createLedger').mockImplementation(async (_manager, input) => {
            const ledgerInput = input as Partial<MembershipPointLedger>
            createdLedgers.push(ledgerInput)
            return Object.assign(new MembershipPointLedger(), {
                id: `ledger-${createdLedgers.length}`,
                ...ledgerInput
            })
        })

        const result = await service.recordGatewayUsage({
            tenantId: 'tenant-1',
            organizationId: 'org-1',
            copilotOrganizationId: 'org-1',
            userId: 'user-1',
            provider: 'openai',
            model: 'gpt-4.1',
            tokenUsed: 2000,
            settlementAmount: 0.2,
            settlementCurrency: 'CNY',
            copilotId: 'copilot-1',
            gatewayRequestId: 'request-1',
            gatewayApiKeyId: 'key-1',
            modelAccess: {
                allowed: true,
                channel: ModelAccessChannelEnum.ExternalApi,
                billableUserId: 'owner-user',
                copilotId: 'copilot-1',
                copilotModelId: 'gpt-4.1',
                provider: 'openai',
                modelType: AiModelTypeEnum.LLM,
                model: 'gpt-4.1',
                accessSource: ModelAccessSourceEnum.Grant,
                multiplier: 2,
                scope: ModelAccessOwnershipScopeEnum.Organization,
                organizationId: 'org-1',
                grantId: 'grant-1'
            }
        })

        expect(findModelAccessSpy).toHaveBeenCalledWith(
            {
                tenantId: 'tenant-1',
                organizationId: 'org-1',
                copilotOrganizationId: 'org-1',
                userId: 'owner-user',
                xpertId: undefined
            },
            manager,
            true
        )
        expect(result).toMatchObject({ chargedPoints: 0.75, excessPoints: 3.25 })
        expect(membership.pointsUsed).toBe(10)
        expect(createdLedgers).toEqual([
            expect.objectContaining({
                pointsDelta: -0.5,
                chargedPoints: 0.5,
                excessPoints: 3.25,
                usageChannel: ModelGatewayUsageChannelEnum.ExternalApi,
                gatewayRequestId: 'request-1'
            }),
            expect.objectContaining({
                pointsDelta: -0.25,
                chargedPoints: 0.25,
                excessPoints: 0,
                gatewayRequestId: 'request-1'
            })
        ])
    })
})
