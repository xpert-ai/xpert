jest.mock('../../xpert/xpert.entity', () => ({
    Xpert: class Xpert {}
}))
import {
    AiModelTypeEnum,
    DEFAULT_MEMBERSHIP_CNY_PER_POINT,
    MembershipLedgerSourceEnum,
    ModelAccessChannelEnum,
    ModelAccessOwnershipScopeEnum,
    ModelAccessSourceEnum,
    ModelGatewayUsageChannelEnum
} from '@xpert-ai/contracts'
import * as membershipLocks from '../membership-locks'
import { MembershipPointLedger } from '../membership-point-ledger.entity'
import { createMembership, createMembershipService } from '../testing/membership-service.test-fixture'
import * as usagePoints from '../membership-usage-points'
import { getMembershipFixture } from '../testing/membership.test-fixture'
import { UserMembership } from '../user-membership.entity'

describe('MembershipService: billing', () => {
    beforeEach(() => {
        jest.spyOn(usagePoints, 'readPeriodConsumedPoints').mockResolvedValue(0)
    })
    afterEach(() => {
        jest.restoreAllMocks()
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
        jest.spyOn(getMembershipFixture(service).access, 'findModelAccess').mockResolvedValue({
            tenantId: 'tenant-1',
            organizationId: null,
            membership
        })
        jest.spyOn(getMembershipFixture(service).records, 'getPersonalPointsBalance').mockResolvedValue(0.25)
        const createLedger = jest
            .spyOn(getMembershipFixture(service).records, 'createLedger')
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
        jest.spyOn(getMembershipFixture(service).access, 'findModelAccess').mockResolvedValue({
            tenantId: 'tenant-1',
            organizationId: null,
            membership,
            personalPointsOnly: true
        })
        jest.spyOn(getMembershipFixture(service).records, 'getPersonalPointsBalance').mockResolvedValue(10)
        const createLedger = jest
            .spyOn(getMembershipFixture(service).records, 'createLedger')
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

    it('still evaluates rate limits for unlimited memberships', async () => {
        const service = createMembershipService({} as never, {} as never, {} as never, {} as never, {} as never)
        const membership = createMembership({ pointsGranted: null, pointsUsed: 999 })
        jest.spyOn(getMembershipFixture(service).access, 'findModelAccess').mockResolvedValue({
            tenantId: 'tenant-1',
            organizationId: null,
            membership
        })
        const assertRateLimits = jest
            .spyOn(getMembershipFixture(service).billing, 'assertRateLimits')
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

        jest.spyOn(membershipLocks, 'acquireGatewayRequestLock').mockResolvedValue(undefined)
        jest.spyOn(getMembershipFixture(service).records, 'resolveTenantCnyPerPoint').mockResolvedValue(
            DEFAULT_MEMBERSHIP_CNY_PER_POINT
        )
        const findModelAccessSpy = jest
            .spyOn(getMembershipFixture(service).access, 'findModelAccessWithOrganizationSelfHeal')
            .mockResolvedValue({
                tenantId: 'tenant-1',
                organizationId: 'org-1',
                membership,
                personalPointsOnly: false
            })
        jest.spyOn(getMembershipFixture(service).records, 'getPersonalPointsBalance').mockResolvedValue(0.25)
        jest.spyOn(getMembershipFixture(service).lifecycle, 'synchronizeCurrentPeriodProjection').mockResolvedValue(
            undefined
        )
        const createdLedgers: Array<Partial<MembershipPointLedger>> = []
        jest.spyOn(getMembershipFixture(service).records, 'createLedger').mockImplementation(
            async (_manager, input) => {
                const ledgerInput = input as Partial<MembershipPointLedger>
                createdLedgers.push(ledgerInput)
                return Object.assign(new MembershipPointLedger(), {
                    id: `ledger-${createdLedgers.length}`,
                    ...ledgerInput
                })
            }
        )

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
