import { Test } from '@nestjs/testing'
import { getRepositoryToken } from '@nestjs/typeorm'
import { CommandBus } from '@nestjs/cqrs'
import {
    AiModelTypeEnum,
    IModelAccessResolution,
    ModelAccessChannelEnum,
    ModelAccessOwnershipScopeEnum,
    ModelExecutionModel,
    ModelGatewayCallStatusEnum,
    ModelGatewayUsageSourceEnum
} from '@xpert-ai/contracts'
import { ModelExecutionMeteringService } from './execution-metering.service'
import { ExecutionUsageFact, ModelExecutionGrant } from './execution.entity'
import { ModelGatewayCall } from '../model-gateway/model-gateway-call.entity'
import { CopilotTokenRecordCommand } from '../copilot-user/commands/token-record.command'
import { ExceedingLimitException } from '../core/errors'

const model: ModelExecutionModel = {
    id: 'alias',
    copilotId: 'copilot',
    providerScopeId: 'pinned-provider',
    providerOrganizationId: 'provider-org',
    provider: 'test',
    model: 'test-model',
    modelType: AiModelTypeEnum.LLM,
    capabilities: [],
    protocols: ['openai_chat']
}
const resolution: IModelAccessResolution = {
    allowed: true,
    billableUserId: 'payer',
    copilotId: model.copilotId,
    copilotModelId: model.model,
    modelType: model.modelType,
    channel: ModelAccessChannelEnum.Xpert,
    multiplier: 1,
    scope: ModelAccessOwnershipScopeEnum.Organization,
    organizationId: 'provider-org'
}

async function setup() {
    const call = Object.assign(new ModelGatewayCall(), {
        id: 'call',
        callId: 'logical-call',
        requestId: 'attempt',
        tenantId: 'tenant',
        grantId: 'grant',
        source: 'execution_grant',
        startedAt: new Date(),
        reservedTokens: 1000,
        totalTokens: 0,
        usageDeliveredAt: null,
        usageFact: null,
        dispatchedAt: new Date()
    })
    const grant = Object.assign(new ModelExecutionGrant(), {
        id: 'grant',
        tenantId: 'tenant',
        context: {
            tenantId: 'tenant',
            runtimeOrganizationId: 'runtime-org',
            actorUserId: 'payer',
            billableUserId: 'payer',
            xpertId: 'assistant',
            assistantVersion: '1',
            conversationId: 'conversation',
            source: { type: 'cli_session', cliSessionId: 'session' },
            environment: { type: 'computer', environmentId: 'environment', instanceId: 'instance' },
            tool: { id: 'opencode', version: '1.18.33' }
        }
    })
    const query = {
        addSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        setLock: jest.fn().mockReturnThis(),
        getOneOrFail: jest.fn(async () => call),
        getOne: jest.fn(async () => call)
    }
    const manager = {
        findOne: jest.fn().mockResolvedValue(null),
        getRepository: () => ({ createQueryBuilder: () => query }),
        save: jest.fn(async () => call),
        query: jest.fn(async () => [])
    }
    const repository = {
        createQueryBuilder: () => query,
        manager: {
            ...manager,
            transaction: async (fn: (transactionManager: typeof manager) => Promise<void>) => fn(manager)
        },
        update: jest.fn(async (_id: string, update: Partial<ModelGatewayCall>) => Object.assign(call, update))
    }
    const commands = { execute: jest.fn<Promise<void>, [CopilotTokenRecordCommand]>().mockResolvedValue(undefined) }
    const module = await Test.createTestingModule({
        providers: [
            ModelExecutionMeteringService,
            { provide: getRepositoryToken(ModelGatewayCall), useValue: repository },
            { provide: getRepositoryToken(ModelExecutionGrant), useValue: { findOneBy: async () => grant } },
            { provide: CommandBus, useValue: commands }
        ]
    }).compile()
    return {
        service: module.get(ModelExecutionMeteringService),
        call,
        grant,
        commands,
        manager,
        input: {
            call,
            grant,
            model,
            resolution,
            providerUsage: null,
            usage: { inputTokens: 40, outputTokens: 10, totalTokens: 50, source: ModelGatewayUsageSourceEnum.Provider }
        }
    }
}

describe('execution usage outbox', () => {
    it('keeps a quota error pending when no completed token delivery receipt exists', async () => {
        const test = await setup()
        test.commands.execute.mockRejectedValueOnce(new ExceedingLimitException('plan unavailable'))
        await test.service.finish(test.input)
        expect(test.call.usageDeliveredAt).toBeNull()
        expect(test.call.status).toBe(ModelGatewayCallStatusEnum.SettlementPending)
        expect(test.manager.query).not.toHaveBeenCalled()
    })

    it('acknowledges a quota error only with a persisted completed delivery receipt', async () => {
        const test = await setup()
        test.commands.execute.mockRejectedValueOnce(new ExceedingLimitException('quota exceeded after delivery'))
        test.manager.findOne.mockResolvedValueOnce({ status: 'completed' })
        await test.service.finish(test.input)
        expect(test.manager.findOne).toHaveBeenCalledWith(expect.any(Function), {
            where: { tenantId: 'tenant', providerScopeId: 'pinned-provider', requestId: 'attempt', status: 'completed' }
        })
        expect(test.call.usageDeliveredAt).toBeInstanceOf(Date)
    })
    it('releases preflight reservations only when the durable dispatch fence was not crossed', async () => {
        const test = await setup()
        test.call.dispatchedAt = null
        await test.service.finish({
            ...test.input,
            error: new Error('model construction failed'),
            usage: { ...test.input.usage, source: ModelGatewayUsageSourceEnum.Estimated }
        })
        expect(test.call.status).toBe(ModelGatewayCallStatusEnum.Failed)
        expect(test.call.reservedTokens).toBe(0)
        expect(test.commands.execute).not.toHaveBeenCalled()
    })
    it('retains a provider fact across failed delivery, and retries the same attempt and payer', async () => {
        const test = await setup()
        test.commands.execute.mockRejectedValueOnce(new Error('ledger temporarily unavailable'))
        await test.service.finish(test.input)
        expect(test.call.status).toBe(ModelGatewayCallStatusEnum.SettlementPending)
        expect(test.call.usageFact.totalTokens).toBe(50)
        expect(test.call.reservedTokens).toBe(0)
        expect(test.call.usageDeliveredAt).toBeNull()
        await test.service.deliver(test.call.id)
        expect(test.call.usageDeliveredAt).toBeInstanceOf(Date)
        for (const [command] of test.commands.execute.mock.calls)
            expect(command.input).toMatchObject({
                requestId: 'attempt',
                userId: 'payer',
                organizationId: 'runtime-org',
                executionModel: model,
                tokenUsed: 50,
                pricingStatus: 'unpriced'
            })
        await test.service.deliver(test.call.id)
        expect(test.commands.execute).toHaveBeenCalledTimes(2)
    })
    it('keeps unknown reservations, accepts late provider evidence, and ignores duplicate callbacks', async () => {
        const test = await setup()
        await test.service.finish({
            ...test.input,
            usage: { ...test.input.usage, source: ModelGatewayUsageSourceEnum.Estimated }
        })
        expect(test.call.usageFact).toBeNull()
        expect(test.call.estimatedUsage).toEqual({ inputTokens: 40, outputTokens: 10, totalTokens: 50 })
        expect(test.call.totalTokens).toBe(0)
        expect(test.call.reservedTokens).toBe(1000)
        expect(test.commands.execute).not.toHaveBeenCalled()
        await test.service.finish(test.input)
        // JSONB may reorder keys and removes undefined values.
        const persisted: ExecutionUsageFact = JSON.parse(JSON.stringify(test.call.usageFact))
        const { model: pinnedModel, ...fields } = persisted
        test.call.usageFact = { model: pinnedModel, ...fields }
        await test.service.finish(test.input)
        expect(test.commands.execute).toHaveBeenCalledTimes(1)
        await expect(
            test.service.finish({ ...test.input, usage: { ...test.input.usage, inputTokens: 50, totalTokens: 60 } })
        ).rejects.toThrow()
        expect(test.call.totalTokens).toBe(50)
    })
    it('replays a delivered ledger command after acknowledgement failure without changing its identity', async () => {
        const test = await setup()
        test.manager.query.mockRejectedValueOnce(new Error('acknowledgement unavailable'))
        await expect(test.service.finish(test.input)).rejects.toThrow('acknowledgement unavailable')
        expect(test.call.usageDeliveredAt).toBeNull()
        await test.service.deliver(test.call.id)
        expect(test.commands.execute.mock.calls.map(([command]) => command.input.requestId)).toEqual([
            'attempt',
            'attempt'
        ])
        expect(test.call.status).toBe(ModelGatewayCallStatusEnum.Succeeded)
    })
})
