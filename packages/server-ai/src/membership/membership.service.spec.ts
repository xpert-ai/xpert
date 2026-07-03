jest.mock('../xpert/xpert.entity', () => ({
    Xpert: class Xpert {}
}))

import { MembershipService } from './membership.service'
import { MembershipPointLedger } from './membership-point-ledger.entity'
import { UserMembership } from './user-membership.entity'
import { Xpert } from '../xpert/xpert.entity'

describe('MembershipService', () => {
    afterEach(() => {
        jest.restoreAllMocks()
    })

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

    function createMembership(overrides: Partial<UserMembership> = {}) {
        return {
            id: 'membership-owner',
            tenantId: 'tenant-1',
            userId: 'owner-user',
            planId: 'plan-1',
            status: 'active',
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
                status: 'active',
                period: 'monthly',
                includedPoints: 100,
                tokensPerPoint: 1000,
                modelMultipliers: [],
                rateLimits: []
            },
            ...overrides
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
        const service = new MembershipService({} as never, {} as never, {} as never, {} as never, {} as never)

        await (
            service as unknown as { findActiveMembershipForUpdate: (...args: unknown[]) => Promise<unknown> }
        ).findActiveMembershipForUpdate('tenant-1', 'user-1', manager)

        expect(queryBuilder.leftJoinAndSelect).toHaveBeenCalledWith('membership.plan', 'plan')
        expect(queryBuilder.where).toHaveBeenCalledWith('membership.tenantId = :tenantId', { tenantId: 'tenant-1' })
        expect(queryBuilder.andWhere).toHaveBeenCalledWith('membership.userId = :userId', { userId: 'user-1' })
        expect(queryBuilder.andWhere).toHaveBeenCalledWith('membership.status = :status', {
            status: 'active'
        })
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
        const service = new MembershipService(
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
        const service = new MembershipService(dataSource as never, {} as never, {} as never, {} as never, {} as never)
        const membership = createMembership()
        jest.spyOn(service as any, 'ensureActiveMembership').mockResolvedValue(membership)
        const createLedger = jest
            .spyOn(service as any, 'createLedger')
            .mockImplementation(async (_manager, input) => input as MembershipPointLedger)

        const ledger = await service.recordUsage({
            tenantId: 'tenant-1',
            organizationId: 'org-1',
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
        expect((service as any).ensureActiveMembership).toHaveBeenCalledWith('tenant-1', 'owner-user', manager, true)
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
        const service = new MembershipService(
            {} as never,
            {} as never,
            {} as never,
            {} as never,
            xpertRepository as never
        )
        const membership = createMembership({ pointsUsed: 0 })
        jest.spyOn(service as any, 'ensureActiveMembership').mockResolvedValue(membership)

        await service.assertCanUse({
            tenantId: 'tenant-1',
            userId: 'assistant-tech-user',
            xpertId: 'xpert-1',
            provider: 'tongyi',
            model: 'qwen3.6-plus'
        })

        expect((service as any).ensureActiveMembership).toHaveBeenCalledWith('tenant-1', 'owner-user')
    })

    it('falls back to the runtime user when xpert has no creator', async () => {
        const xpertRepository = {
            findOne: jest.fn().mockResolvedValue({
                id: 'xpert-1',
                createdById: null
            })
        }
        const service = new MembershipService(
            {} as never,
            {} as never,
            {} as never,
            {} as never,
            xpertRepository as never
        )
        const membership = createMembership({ userId: 'assistant-tech-user', pointsUsed: 0 })
        jest.spyOn(service as any, 'ensureActiveMembership').mockResolvedValue(membership)

        await service.assertCanUse({
            tenantId: 'tenant-1',
            userId: 'assistant-tech-user',
            xpertId: 'xpert-1'
        })

        expect((service as any).ensureActiveMembership).toHaveBeenCalledWith('tenant-1', 'assistant-tech-user')
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
        const service = new MembershipService(
            dataSource as never,
            {} as never,
            {} as never,
            {} as never,
            xpertRepository as never
        )
        const membership = createMembership({ userId: 'assistant-tech-user' })
        jest.spyOn(service as any, 'ensureActiveMembership').mockResolvedValue(membership)
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
        expect((service as any).ensureActiveMembership).toHaveBeenCalledWith(
            'tenant-1',
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
})
