jest.mock('../xpert/xpert.entity', () => ({
    Xpert: class Xpert {}
}))

import { MembershipService } from './membership.service'
import { MembershipPlan } from './membership-plan.entity'
import { MembershipPointLedger } from './membership-point-ledger.entity'
import { UserMembership } from './user-membership.entity'
import { Xpert } from '../xpert/xpert.entity'
import { FeatureOrganization, RequestContext } from '@xpert-ai/server-core'
import { MembershipPeriodEnum, MembershipPlanStatusEnum, MembershipStatusEnum } from '@xpert-ai/contracts'
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
    } {
        return {
            id: 'membership-owner',
            tenantId: 'tenant-1',
            userId: 'owner-user',
            planId: 'plan-1',
            status: MembershipStatusEnum.Active,
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
        } as UserMembership & { plan: NonNullable<UserMembership['plan']> }
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
        userOrganizationRepository: never | undefined = undefined,
        copilotRepository: never | undefined = undefined,
        featureOrganizationRepository: never = createMembershipFeatureRepository().repository as never
    ) {
        return new MembershipService(
            dataSource,
            planRepository,
            membershipRepository,
            ledgerRepository,
            xpertRepository,
            userOrganizationRepository,
            copilotRepository,
            featureOrganizationRepository
        )
    }

    function createScopeInitializationHarness() {
        const plans: MembershipPlan[] = []
        const memberships: UserMembership[] = []
        const ledgers: MembershipPointLedger[] = []
        const featureOrganizationRepository = createMembershipFeatureRepository().repository
        const updateBuilder = {
            update: jest.fn().mockReturnThis(),
            set: jest.fn().mockReturnThis(),
            where: jest.fn().mockReturnThis(),
            andWhere: jest.fn().mockReturnThis(),
            execute: jest.fn().mockResolvedValue(undefined)
        }
        const planRepository = {
            createQueryBuilder: jest.fn().mockReturnValue(updateBuilder),
            create: jest.fn((input) => ({ id: 'plan-default', ...input })),
            find: jest.fn(async () => [...plans]),
            findOne: jest.fn(async ({ where }) => {
                if (where?.status === MembershipPlanStatusEnum.Active && where?.isDefault === true) {
                    return (
                        plans.find((plan) => plan.status === MembershipPlanStatusEnum.Active && plan.isDefault) ?? null
                    )
                }
                if (where?.status === MembershipPlanStatusEnum.Active && where?.isDefault === undefined) {
                    return plans.find((plan) => plan.status === MembershipPlanStatusEnum.Active) ?? null
                }
                if (where?.code === 'default-unlimited') {
                    return plans.find((plan) => plan.code === 'default-unlimited') ?? null
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
            })
        }
        const userOrganizationRepository = {
            find: jest.fn().mockResolvedValue([{ userId: 'user-1' }, { userId: 'user-2' }])
        }
        const membershipRepository = {
            create: jest.fn((input) => ({ id: `membership-${memberships.length + 1}`, ...input })),
            count: jest.fn(async () => memberships.length),
            find: jest.fn(async () => memberships.map((membership) => ({ userId: membership.userId }))),
            save: jest.fn(async (membership) => {
                const saved = {
                    ...membership,
                    id: membership.id ?? `membership-${memberships.length + 1}`
                } as UserMembership
                memberships.push(saved)
                return saved
            })
        }
        const ledgerRepository = {
            create: jest.fn((input) => ({ id: `ledger-${ledgers.length + 1}`, ...input })),
            save: jest.fn(async (ledger) => {
                ledgers.push(ledger as MembershipPointLedger)
                return ledger as MembershipPointLedger
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
                if (entity === FeatureOrganization) {
                    return featureOrganizationRepository
                }
                return userOrganizationRepository
            })
        }
        const dataSource = {
            transaction: jest.fn((callback) => callback(manager))
        }

        return {
            dataSource,
            ledgerRepository,
            memberships,
            membershipRepository,
            planRepository,
            plans,
            service: createMembershipService(
                dataSource as never,
                planRepository as never,
                membershipRepository as never,
                ledgerRepository as never,
                {} as never,
                userOrganizationRepository as never,
                undefined,
                featureOrganizationRepository as never
            )
        }
    }

    it('locks only membership rows when loading an active membership for update', async () => {
        const queryBuilder = {
            leftJoinAndSelect: jest.fn().mockReturnThis(),
            where: jest.fn().mockReturnThis(),
            andWhere: jest.fn().mockReturnThis(),
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
        expect(queryBuilder.where).toHaveBeenCalledWith('membership.tenantId = :tenantId', { tenantId: 'tenant-1' })
        expect(queryBuilder.andWhere).toHaveBeenCalledWith('membership.userId = :userId', { userId: 'user-1' })
        expect(queryBuilder.andWhere).toHaveBeenCalledWith('membership.status = :status', {
            status: 'active'
        })
        expect(queryBuilder.andWhere).toHaveBeenCalledWith('membership.organizationId IS NULL')
        expect(queryBuilder.setLock).toHaveBeenCalledTimes(1)
        expect(queryBuilder.setLock).toHaveBeenCalledWith('pessimistic_write', undefined, ['membership'])
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
        expect(queryBuilder.andWhere).toHaveBeenCalledWith('ledger.source = :source', { source: 'usage' })
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

    it('uses organization membership before tenant membership for model access', async () => {
        const service = createMembershipService({} as never, {} as never, {} as never, {} as never, {} as never)
        const organizationMembership = createMembership({ organizationId: 'org-1' })
        const findUsableMembership = jest
            .spyOn(service as any, 'findUsableMembership')
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
            .spyOn(service as any, 'findUsableMembership')
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

    it('does not fall back to tenant membership when organization has an active plan', async () => {
        const service = createMembershipService({} as never, {} as never, {} as never, {} as never, {} as never)
        const findUsableMembership = jest.spyOn(service as any, 'findUsableMembership').mockResolvedValue(null)
        jest.spyOn(service as any, 'hasActivePlan').mockResolvedValue(true)

        const access = await service.findModelAccess({
            tenantId: 'tenant-1',
            organizationId: 'org-1',
            userId: 'assistant-tech-user'
        })

        expect(access).toBeNull()
        expect(findUsableMembership).toHaveBeenCalledTimes(1)
        expect(findUsableMembership).toHaveBeenCalledWith('tenant-1', 'org-1', 'assistant-tech-user', undefined, false)
    })

    it('initializes organization scope with a default unlimited plan and active member memberships idempotently', async () => {
        const { ledgerRepository, memberships, membershipRepository, planRepository, plans, service } =
            createScopeInitializationHarness()

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
            code: 'default-unlimited',
            name: 'Default Unlimited',
            includedPoints: null,
            tokensPerPoint: 1000,
            isDefault: true,
            status: MembershipPlanStatusEnum.Active
        })
        expect(memberships).toHaveLength(2)
        expect(membershipRepository.save).toHaveBeenCalledTimes(2)
        expect(ledgerRepository.save).toHaveBeenCalledTimes(2)
        expect(ledgerRepository.save).toHaveBeenCalledWith(expect.objectContaining({ pointsDelta: 0 }))
        expect(planRepository.save).toHaveBeenCalledTimes(1)
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
        jest.spyOn(service as any, 'findUsableMembership').mockResolvedValue(membership)
        const createLedger = jest
            .spyOn(service as any, 'createLedger')
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
        expect((service as any).findUsableMembership).toHaveBeenCalledWith(
            'tenant-1',
            'org-1',
            'owner-user',
            manager,
            true
        )
        expect(membershipRepository.save).toHaveBeenCalledWith(expect.objectContaining({ pointsUsed: 5 }))
        expect(createLedger).toHaveBeenCalledWith(
            manager,
            expect.objectContaining({
                tenantId: 'tenant-1',
                userId: 'owner-user',
                membershipId: 'membership-owner',
                planId: 'plan-1',
                source: 'usage',
                pointsDelta: -3,
                tokenUsed: 2500,
                organizationId: 'org-1',
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
        jest.spyOn(service as any, 'findUsableMembership').mockResolvedValue(membership)

        await service.assertCanUse({
            tenantId: 'tenant-1',
            userId: 'assistant-tech-user',
            xpertId: 'xpert-1',
            provider: 'tongyi',
            model: 'qwen3.6-plus'
        })

        expect((service as any).findUsableMembership).toHaveBeenCalledWith(
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
        jest.spyOn(service as any, 'findUsableMembership').mockResolvedValue(membership)

        await service.assertCanUse({
            tenantId: 'tenant-1',
            userId: 'assistant-tech-user',
            xpertId: 'xpert-1'
        })

        expect((service as any).findUsableMembership).toHaveBeenCalledWith(
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
        jest.spyOn(service as any, 'findUsableMembership').mockResolvedValue(membership)
        const createLedger = jest
            .spyOn(service as any, 'createLedger')
            .mockImplementation(async (_manager, input) => input as MembershipPointLedger)

        await service.recordUsage({
            tenantId: 'tenant-1',
            userId: 'assistant-tech-user',
            provider: 'tongyi',
            model: 'qwen3.6-plus',
            tokenUsed: 1000
        })

        expect(xpertRepository.findOne).not.toHaveBeenCalled()
        expect((service as any).findUsableMembership).toHaveBeenCalledWith(
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
        jest.spyOn(service as any, 'findUsableMembership').mockResolvedValue(null)
        const createLedger = jest.spyOn(service as any, 'createLedger')

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
        jest.spyOn(service as any, 'findUsableMembership').mockResolvedValue(null)

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

        expect((service as any).findUsableMembership).toHaveBeenCalledWith(
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
        const assertRateLimits = jest.spyOn(service as any, 'assertRateLimits').mockResolvedValue(undefined)

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

    it('records usage for unlimited memberships without total point limit failures', async () => {
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
        const service = createMembershipService(dataSource as never, {} as never, {} as never, {} as never, {} as never)
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
            .spyOn(service as any, 'createLedger')
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

        expect(membershipRepository.save).toHaveBeenCalledWith(expect.objectContaining({ pointsUsed: 102 }))
        expect(createLedger).toHaveBeenCalledWith(
            manager,
            expect.objectContaining({
                pointsDelta: -3,
                tokenUsed: 2500,
                organizationId: 'org-1'
            })
        )
        expect(ledger).toMatchObject({ pointsDelta: -3, tokenUsed: 2500 })
    })

    it('still evaluates rate limits for unlimited memberships', async () => {
        const service = createMembershipService({} as never, {} as never, {} as never, {} as never, {} as never)
        const membership = createMembership({ pointsGranted: null, pointsUsed: 999 })
        jest.spyOn(service, 'findModelAccess').mockResolvedValue({
            tenantId: 'tenant-1',
            organizationId: null,
            membership
        })
        const assertRateLimits = jest.spyOn(service as any, 'assertRateLimits').mockResolvedValue(undefined)

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
