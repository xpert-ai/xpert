// Exercise the real receipt, gateway and membership settlement code together;
// only provider transport, eligibility lookup and persistence are test fixtures.
jest.mock('../xpert/xpert.entity', () => ({ Xpert: class Xpert {} }))

import { AIMessage, AIMessageChunk } from '@langchain/core/messages'
import { ChatGeneration } from '@langchain/core/outputs'
import {
    AIModelEntity,
    AiModelTypeEnum,
    AiProviderRole,
    FetchFrom,
    ILLMUsage,
    IModelAccessResolution,
    MEMBERSHIP_CNY_PER_POINT_SETTING,
    ModelAccessChannelEnum,
    ModelAccessOwnershipScopeEnum,
    ModelAccessSourceEnum,
    ModelGatewayCallStatusEnum,
    ModelGatewayUsageChannelEnum
} from '@xpert-ai/contracts'
import { LargeLanguageModel, ModelProvider } from '@xpert-ai/plugin-sdk'
import { EntityManager } from 'typeorm'
import { MembershipPlan } from '../membership/membership-plan.entity'
import { MembershipPointLedger } from '../membership/membership-point-ledger.entity'
import { MembershipService } from '../membership/membership.service'
import { UserMembership } from '../membership/user-membership.entity'
import { ModelGatewayCall } from './model-gateway-call.entity'
import { ModelGatewayService } from './model-gateway.service'
import { responseUsage } from './openai-adapter'

class FixtureProvider extends ModelProvider {
    getAuthorization() {
        return ''
    }
    getBaseUrl() {
        return ''
    }
    async validateProviderCredentials() {}
}

class FixtureModel extends LargeLanguageModel {
    constructor() {
        super(new FixtureProvider(), AiModelTypeEnum.LLM)
    }
    async validateCredentials() {}
    override predefinedModels(): AIModelEntity[] {
        return [
            {
                model: 'reasoning-fixture',
                label: { en_US: 'Reasoning fixture', zh_Hans: '推理测试' },
                model_type: AiModelTypeEnum.LLM,
                fetch_from: FetchFrom.PREDEFINED_MODEL,
                model_properties: {},
                pricing: {
                    input: 2,
                    output: 8,
                    unit: 0.000001,
                    currency: 'RMB',
                    rules: [
                        { component: 'cache_read_input', unit_price: 0.2, unit_size: 1000000 },
                        { component: 'cache_write_input', unit_price: 2.5, unit_size: 1000000 }
                    ]
                }
            }
        ]
    }
}

const resolution: IModelAccessResolution = {
    allowed: true,
    channel: ModelAccessChannelEnum.ExternalApi,
    billableUserId: 'user-1',
    copilotId: 'copilot-1',
    copilotModelId: 'reasoning-fixture',
    provider: 'fixture',
    modelType: AiModelTypeEnum.LLM,
    model: 'reasoning-fixture',
    accessSource: ModelAccessSourceEnum.Grant,
    multiplier: 2,
    scope: ModelAccessOwnershipScopeEnum.Tenant,
    organizationId: null,
    grantId: 'grant-1'
}

function fixture() {
    const ledgers: MembershipPointLedger[] = []
    const ledgerRepository = {
        find: jest.fn(async () => ledgers),
        create: jest.fn((input: Partial<MembershipPointLedger>) => Object.assign(new MembershipPointLedger(), input)),
        save: jest.fn(async (ledger: MembershipPointLedger) => {
            ledger.id = `ledger-${ledgers.length + 1}`
            ledgers.push(ledger)
            return ledger
        })
    }
    const membership = Object.assign(new UserMembership(), {
        id: 'membership-1',
        tenantId: 'tenant-1',
        userId: 'user-1',
        planId: 'plan-1',
        pointsGranted: 100,
        pointsUsed: 0,
        plan: Object.assign(new MembershipPlan(), { id: 'plan-1' })
    })
    const membershipRepository = { save: jest.fn(async (value: UserMembership) => value) }
    const manager = {
        connection: { options: { type: 'sqlite' } },
        getRepository: jest.fn((entity: unknown) => {
            if (entity === MembershipPointLedger) return ledgerRepository
            if (entity === UserMembership) return membershipRepository
            throw new Error('Unexpected repository')
        })
    }
    const dataSource = {
        transaction: jest.fn((run: (manager: EntityManager) => Promise<unknown>) => run(manager as never))
    }
    const settings = { findOne: jest.fn(async () => ({ value: '0.01' })) }
    const membershipService = new MembershipService(
        dataSource as never,
        {} as never,
        membershipRepository as never,
        ledgerRepository as never,
        {} as never,
        undefined,
        undefined,
        undefined,
        undefined,
        settings as never
    )
    const eligibility = membershipService as unknown as {
        findModelAccessWithOrganizationSelfHeal: (...args: unknown[]) => Promise<unknown>
    }
    jest.spyOn(eligibility, 'findModelAccessWithOrganizationSelfHeal').mockResolvedValue({
        tenantId: 'tenant-1',
        organizationId: null,
        membership,
        personalPointsOnly: false
    })
    const recordUsage = jest.spyOn(membershipService, 'recordGatewayUsage')
    const call = Object.assign(new ModelGatewayCall(), {
        id: 'call-1',
        tenantId: 'tenant-1',
        userId: 'user-1',
        apiKeyId: 'key-1',
        requestId: 'request-1',
        provider: 'fixture',
        model: 'reasoning-fixture',
        status: ModelGatewayCallStatusEnum.Started,
        startedAt: new Date(),
        chargedPoints: 0,
        excessPoints: 0,
        settlementContext: resolution
    })
    const callRepository = {
        findOne: jest.fn(async () => call),
        save: jest.fn(async (value: ModelGatewayCall) => value)
    }
    const gateway = new ModelGatewayService(
        {} as never,
        {} as never,
        {} as never,
        callRepository as never,
        {} as never,
        {} as never,
        {} as never,
        membershipService,
        {} as never,
        dataSource as never
    )
    return { call, gateway, membership, membershipService, recordUsage, ledgers, ledgerRepository, settings }
}

async function receipt(
    options: {
        chunk?: boolean
        reasoning?: number
        cacheRead?: number
        cacheWrite?: number
        reportedAmount?: number
        unpriced?: boolean
    } = {}
) {
    const Message = options.chunk ? AIMessageChunk : AIMessage
    const message = new Message({
        content: 'done',
        usage_metadata: {
            input_tokens: 31,
            output_tokens: 48,
            total_tokens: 79,
            input_token_details: { cache_read: options.cacheRead ?? 0, cache_creation: options.cacheWrite ?? 0 },
            output_token_details: { reasoning: options.reasoning }
        }
    })
    let usage: ILLMUsage | undefined
    const [callback] = new FixtureModel().createHandleUsageCallbacks(
        { role: AiProviderRole.Primary },
        'reasoning-fixture',
        {},
        (event) => {
            usage = event.usage
        },
        {
            reportedPriceRequired: options.unpriced,
            resolveReportedPrice: () =>
                options.reportedAmount === undefined ? undefined : { amount: options.reportedAmount, currency: 'RMB' }
        }
    )
    const generation: ChatGeneration = { text: 'done', message }
    await callback.handleLLMEnd({ generations: [[generation]] }, 'request-1')
    if (!usage) throw new Error('SDK did not emit a receipt')
    return { usage, message }
}

describe('SDK receipt → gateway → membership settlement', () => {
    afterEach(() => jest.restoreAllMocks())

    it.each([false, true])('charges reasoning usage and writes an idempotent ledger (chunk=%s)', async (chunk) => {
        const state = fixture()
        const { usage: sdkUsage, message } = await receipt({ chunk, reasoning: 38 })
        const usage = responseUsage([], 'done', sdkUsage, message)
        const result = await state.gateway.finishCall({ call: state.call, resolution, usage })

        expect(sdkUsage).toMatchObject({ totalTokens: 79, reasoningTokens: 38, totalPrice: 0.000446 })
        expect(result).toMatchObject({
            status: ModelGatewayCallStatusEnum.Succeeded,
            inputTokens: 31,
            outputTokens: 48,
            totalTokens: 79,
            priceAmount: 0.000446,
            priceCurrency: 'RMB',
            settlementAmount: 0.000446,
            settlementCurrency: 'CNY',
            chargedPoints: 0.0892,
            excessPoints: 0
        })
        expect(state.settings.findOne).toHaveBeenCalledWith({
            where: { tenantId: 'tenant-1', name: MEMBERSHIP_CNY_PER_POINT_SETTING }
        })
        expect(state.membership.pointsUsed).toBe(0.0892)
        expect(state.ledgers).toEqual([
            expect.objectContaining({
                tokenUsed: 79,
                pointsDelta: -0.0892,
                chargedPoints: 0.0892,
                priceAmount: 0.000446,
                settlementAmount: 0.000892,
                gatewayRequestId: 'request-1',
                sourceReference: 'model-gateway:request-1',
                usageChannel: ModelGatewayUsageChannelEnum.ExternalApi
            })
        ])

        await state.gateway.finishCall({ call: state.call, resolution, usage })
        expect(state.recordUsage).toHaveBeenCalledTimes(1)
        const duplicate = await state.membershipService.recordGatewayUsage(state.recordUsage.mock.calls[0][0])
        expect(duplicate.chargedPoints).toBe(0.0892)
        expect(state.membership.pointsUsed).toBe(0.0892)
        expect(state.ledgerRepository.save).toHaveBeenCalledTimes(1)
    })

    it.each([undefined, 0])('settles a response with reasoning=%s', async (reasoning) => {
        const state = fixture()
        const { usage, message } = await receipt({ reasoning })
        await state.gateway.finishCall({
            call: state.call,
            resolution,
            usage: responseUsage([], 'done', usage, message)
        })
        expect(state.call).toMatchObject({ status: ModelGatewayCallStatusEnum.Succeeded, chargedPoints: 0.0892 })
    })

    it.each(['mismatched', 'unpriced'] as const)(
        'keeps %s pricing pending without failing inference or charging',
        async (kind) => {
            const state = fixture()
            const { usage: sdkUsage, message } = await receipt({ reasoning: 38, unpriced: kind === 'unpriced' })
            if (kind === 'mismatched') sdkUsage.reasoningTokens = 37
            const usage = responseUsage([], 'done', sdkUsage, message)
            await state.gateway.finishCall({ call: state.call, resolution, usage })
            expect(state.call).toMatchObject({
                status: ModelGatewayCallStatusEnum.SettlementPending,
                priceAmount: null,
                settlementAmount: null,
                chargedPoints: 0,
                errorCode: null,
                errorMessage: null,
                settlementContext: resolution
            })
            expect(state.recordUsage).not.toHaveBeenCalled()
            expect(state.ledgers).toHaveLength(0)
            const completedAt = state.call.completedAt
            // Retry from persisted NULL values must not turn unknown pricing into a free call.
            await state.gateway.finishCall({
                call: state.call,
                resolution,
                usage: { ...usage, priceAmount: null, priceCurrency: 'RMB', settlementAmount: null }
            })
            expect(state.call.status).toBe(ModelGatewayCallStatusEnum.SettlementPending)
            expect(state.call.completedAt).toBe(completedAt)
            expect(state.recordUsage).not.toHaveBeenCalled()
        }
    )

    it('prices cached input separately without counting cache or reasoning twice', async () => {
        const state = fixture()
        const { usage: sdkUsage, message } = await receipt({ reasoning: 38, cacheRead: 5, cacheWrite: 3 })
        const usage = responseUsage([], 'done', sdkUsage, message)
        expect(usage).toMatchObject({
            totalTokens: 79,
            cacheReadInputTokens: 5,
            cacheWriteInputTokens: 3,
            reasoningTokens: 38
        })
        await state.gateway.finishCall({ call: state.call, resolution, usage })
        expect(state.call).toMatchObject({
            status: ModelGatewayCallStatusEnum.Succeeded,
            priceAmount: 0.0004385,
            chargedPoints: 0.0877
        })
        expect(state.ledgers).toEqual([expect.objectContaining({ tokenUsed: 79, pointsDelta: -0.0877 })])
    })

    it('retains the upstream failure when a pending price becomes available', async () => {
        const state = fixture()
        const { usage: sdkUsage, message } = await receipt({ reasoning: 38 })
        const verified = responseUsage([], 'done', sdkUsage, message)
        await state.gateway.finishCall({
            call: state.call,
            resolution,
            usage: { ...verified, priceAmount: undefined, priceCurrency: undefined },
            error: new Error('upstream interrupted')
        })
        expect(state.call.status).toBe(ModelGatewayCallStatusEnum.SettlementPending)
        expect(state.call.errorMessage).toBe('upstream interrupted')
        await state.gateway.finishCall({ call: state.call, resolution, usage: verified })
        expect(state.call).toMatchObject({
            status: ModelGatewayCallStatusEnum.Failed,
            chargedPoints: 0.0892,
            settlementContext: null
        })
        expect(state.ledgers).toHaveLength(1)
    })

    it('does not leave a failed request with no consumption pending settlement', async () => {
        const state = fixture()
        await state.gateway.finishCall({
            call: state.call,
            resolution,
            usage: responseUsage([], ''),
            error: new Error('upstream unavailable')
        })
        expect(state.call).toMatchObject({
            status: ModelGatewayCallStatusEnum.Failed,
            totalTokens: 0,
            chargedPoints: 0
        })
        expect(state.ledgers).toHaveLength(0)
    })

    it('distinguishes explicitly free pricing from unpriced usage', async () => {
        const state = fixture()
        const { usage, message } = await receipt({ reasoning: 38, reportedAmount: 0 })
        await state.gateway.finishCall({
            call: state.call,
            resolution,
            usage: responseUsage([], 'done', usage, message)
        })
        expect(state.call).toMatchObject({
            status: ModelGatewayCallStatusEnum.Succeeded,
            priceAmount: 0,
            settlementAmount: 0,
            chargedPoints: 0,
            settlementContext: null
        })
        expect(state.ledgers).toHaveLength(0)
    })

    it('settles provider-reported prices while retaining canonical reasoning counts', async () => {
        const state = fixture()
        const { usage, message } = await receipt({ reasoning: 38, reportedAmount: 0.001 })
        await state.gateway.finishCall({
            call: state.call,
            resolution,
            usage: responseUsage([], 'done', usage, message)
        })
        expect(state.call).toMatchObject({ status: ModelGatewayCallStatusEnum.Succeeded, chargedPoints: 0.2 })
        expect(state.ledgers).toHaveLength(1)
    })
})
