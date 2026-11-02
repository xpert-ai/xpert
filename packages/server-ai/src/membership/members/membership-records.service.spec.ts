jest.mock('../../xpert/xpert.entity', () => ({
    Xpert: class Xpert {}
}))
import { MembershipLedgerSourceEnum, UserType } from '@xpert-ai/contracts'
import { RequestContext } from '@xpert-ai/plugin-sdk'
import { createMembershipService, createQueryBuilder } from '../testing/membership-service.test-fixture'
import * as usagePoints from '../membership-usage-points'
import { getMembershipFixture } from '../testing/membership.test-fixture'

describe('MembershipService: records', () => {
    beforeEach(() => {
        jest.spyOn(usagePoints, 'readPeriodConsumedPoints').mockResolvedValue(0)
    })
    afterEach(() => {
        jest.restoreAllMocks()
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

        await getMembershipFixture(service).records.createLedger(undefined, {
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

        await getMembershipFixture(service).records.findActiveMembershipForUpdate(
            'tenant-1',
            null,
            'user-1',
            manager as never
        )

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

        await getMembershipFixture(service).records.findActiveMembership('tenant-1', null, 'user-1')

        expect(queryBuilder.orderBy).toHaveBeenCalledWith('membership.updatedAt', 'DESC')
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
        const findTopLedgerRanks = getMembershipFixture(service).usage.findTopLedgerRanks.bind(
            getMembershipFixture(service).usage
        )
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
})
