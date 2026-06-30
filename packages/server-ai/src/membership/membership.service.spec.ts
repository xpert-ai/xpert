import { MembershipService } from './membership.service'

describe('MembershipService', () => {
    function createQueryBuilder(rawRows: Array<Record<string, unknown>>) {
        return {
            select: jest.fn().mockReturnThis(),
            addSelect: jest.fn().mockReturnThis(),
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
        const service = new MembershipService({} as never, {} as never, {} as never, {} as never)

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
        const service = new MembershipService({} as never, {} as never, {} as never, ledgerRepository as never)

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
        expect(queryBuilder.groupBy).toHaveBeenCalledWith('ledger.usageHour')
        expect(queryBuilder.addGroupBy).toHaveBeenCalledWith('ledger.provider')
        expect(queryBuilder.addGroupBy).toHaveBeenCalledWith('ledger.model')
        expect(queryBuilder.addGroupBy).toHaveBeenCalledWith('ledger.threadId')
        expect(queryBuilder.orderBy).toHaveBeenCalledWith('MAX(ledger.createdAt)', 'DESC')
    })
})
