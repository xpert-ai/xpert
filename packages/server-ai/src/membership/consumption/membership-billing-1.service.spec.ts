import {
    AiModelTypeEnum,
    MEMBERSHIP_CNY_PER_POINT_SETTING,
    MembershipLedgerSourceEnum,
    MembershipSourceEnum,
    ModelAccessChannelEnum,
    ModelAccessOwnershipScopeEnum,
    ModelAccessSourceEnum,
    UserType
} from '@xpert-ai/contracts'
import i18next from 'i18next'
import { Xpert } from '../../xpert/xpert.entity'
import { MembershipPointLedger } from '../membership-point-ledger.entity'
import {
    createMembership,
    createMembershipFeatureRepository,
    createMembershipService,
    createScopeInitializationHarness
} from '../testing/membership-service.test-fixture'
import * as usagePoints from '../membership-usage-points'
import { getMembershipFixture } from '../testing/membership.test-fixture'
import { UserMembership } from '../user-membership.entity'
jest.mock('../../xpert/xpert.entity', () => ({
    Xpert: class Xpert {}
}))

describe('MembershipService: billing', () => {
    beforeEach(() => {
        jest.spyOn(usagePoints, 'readPeriodConsumedPoints').mockResolvedValue(0)
    })
    afterEach(() => {
        jest.restoreAllMocks()
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
        const findModelAccess = jest.spyOn(getMembershipFixture(service).access, 'findModelAccess')

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
        const isMembershipAccessEnabled = jest.spyOn(getMembershipFixture(service).policy, 'isMembershipAccessEnabled')
        const findModelAccess = jest.spyOn(getMembershipFixture(service).access, 'findModelAccess')

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
        const isMembershipAccessEnabled = jest.spyOn(getMembershipFixture(service).policy, 'isMembershipAccessEnabled')

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
        const initialize = jest
            .spyOn(getMembershipFixture(service).initialization, 'ensureScopeInitialized')
            .mockResolvedValue({} as never)

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

    it('records xpert usage against the xpert creator membership', async () => {
        const xpertRepository = {
            existsBy: jest.fn().mockResolvedValue(false),
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
        jest.spyOn(getMembershipFixture(service).lifecycle, 'findUsableMembership').mockResolvedValue(membership)
        const createLedger = jest
            .spyOn(getMembershipFixture(service).records, 'createLedger')
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
        expect(getMembershipFixture(service).lifecycle.findUsableMembership).toHaveBeenCalledWith(
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
        jest.spyOn(getMembershipFixture(service).lifecycle, 'findUsableMembership').mockResolvedValue(membership)

        await service.assertCanUse({
            tenantId: 'tenant-1',
            userId: 'assistant-tech-user',
            xpertId: 'xpert-1',
            provider: 'tongyi',
            model: 'qwen3.6-plus'
        })

        expect(getMembershipFixture(service).lifecycle.findUsableMembership).toHaveBeenCalledWith(
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
        const findUsableMembership = jest.spyOn(getMembershipFixture(service).lifecycle, 'findUsableMembership')

        await expect(
            service.assertCanUse({
                tenantId: 'tenant-1',
                userId: 'assistant-tech-user',
                xpertId: 'xpert-1'
            })
        ).rejects.toThrow('The Xpert creator is required')

        expect(findUsableMembership).not.toHaveBeenCalled()
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
        jest.spyOn(getMembershipFixture(service).lifecycle, 'findUsableMembership').mockResolvedValue(membership)
        const createLedger = jest
            .spyOn(getMembershipFixture(service).records, 'createLedger')
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
        expect(getMembershipFixture(service).lifecycle.findUsableMembership).toHaveBeenCalledWith(
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
        jest.spyOn(getMembershipFixture(service).lifecycle, 'findUsableMembership').mockResolvedValue(null)
        jest.spyOn(getMembershipFixture(service).records, 'getPersonalPointsBalance').mockResolvedValue(0)
        const createLedger = jest.spyOn(getMembershipFixture(service).records, 'createLedger')

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
        jest.spyOn(getMembershipFixture(service).lifecycle, 'findUsableMembership').mockResolvedValue(null)
        jest.spyOn(getMembershipFixture(service).records, 'getPersonalPointsBalance').mockResolvedValue(0)

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

        expect(getMembershipFixture(service).lifecycle.findUsableMembership).toHaveBeenCalledWith(
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
        jest.spyOn(getMembershipFixture(service).access, 'findModelAccess')
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
        const ensureScopeInitialized = jest
            .spyOn(getMembershipFixture(service).initialization, 'ensureScopeInitialized')
            .mockResolvedValue({
                tenantId: 'tenant-1',
                organizationId: 'org-1',
                scope: 'organization',
                planCount: 1,
                activePlanCount: 1,
                initialized: true,
                needsRepair: false
            })
        const assertRateLimits = jest
            .spyOn(getMembershipFixture(service).billing, 'assertRateLimits')
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
        jest.spyOn(getMembershipFixture(service).access, 'findModelAccess').mockResolvedValue({
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
        jest.spyOn(getMembershipFixture(service).access, 'findModelAccess').mockResolvedValue({
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
        jest.spyOn(getMembershipFixture(service).access, 'findModelAccess').mockResolvedValue({
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
        jest.spyOn(getMembershipFixture(service).access, 'findModelAccess').mockResolvedValue({
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
        jest.spyOn(getMembershipFixture(service).access, 'findModelAccess').mockResolvedValue({
            tenantId: 'tenant-1',
            organizationId: 'org-1',
            membership
        })
        const createLedger = jest
            .spyOn(getMembershipFixture(service).records, 'createLedger')
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
        jest.spyOn(getMembershipFixture(service).access, 'findModelAccess').mockResolvedValue({
            tenantId: 'tenant-1',
            organizationId: null,
            membership
        })
        jest.spyOn(getMembershipFixture(service).records, 'getPersonalPointsBalance').mockResolvedValue(5)
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
})
