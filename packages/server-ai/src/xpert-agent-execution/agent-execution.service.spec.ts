import { TenantOrganizationAwareCrudService } from '@xpert-ai/server-core'
import { XpertAgentExecutionStatusEnum } from '@xpert-ai/contracts'
import { XpertAgentExecution } from './agent-execution.entity'
import { Repository } from 'typeorm'
import { XpertAgentExecutionService } from './agent-execution.service'

describe('XpertAgentExecutionService', () => {
    it('atomically records tokens and actual usage details', async () => {
        const manager = {
            findOne: jest.fn(async () => ({
                tokens: 120,
                currency: 'USD',
                totalPrice: 0.2,
                inputTokens: 100,
                outputTokens: 20
            })),
            increment: jest.fn(async () => undefined),
            update: jest.fn(async () => undefined)
        }
        const repository = {
            manager: {
                transaction: jest.fn(async (callback) => callback(manager))
            }
        }
        const service = new XpertAgentExecutionService(repository as never)
        const details = {
            promptTokens: 10,
            completionTokens: 2,
            totalTokens: 12,
            promptUnitPrice: 1,
            promptPriceUnit: 1000,
            promptPrice: 0.01,
            completionUnitPrice: 2,
            completionPriceUnit: 1000,
            completionPrice: 0.004,
            totalPrice: 0.014,
            currency: 'USD',
            latency: 20
        }

        await service.recordUsage('execution-1', { tokens: 12, details })

        expect(manager.findOne).toHaveBeenCalledWith(XpertAgentExecution, {
            where: { id: 'execution-1' },
            lock: { mode: 'pessimistic_write' },
            select: {
                id: true,
                tokens: true,
                inputTokens: true,
                outputTokens: true,
                totalPrice: true,
                currency: true,
                usageSummary: true
            }
        })
        expect(manager.update).toHaveBeenCalledWith(
            expect.any(Function),
            { id: 'execution-1' },
            expect.objectContaining({
                responseLatency: 0.02,
                tokens: 132,
                totalPrice: expect.closeTo(0.214, 10),
                inputTokens: 110,
                outputTokens: 22
            })
        )
    })

    it('only increments tokens for estimated usage', async () => {
        const manager = {
            increment: jest.fn(async () => undefined),
            update: jest.fn(async () => undefined)
        }
        const repository = {
            manager: {
                transaction: jest.fn(async (callback) => callback(manager))
            }
        }
        const service = new XpertAgentExecutionService(repository as never)

        await service.recordUsage('execution-1', { type: 'estimated', tokens: 12 })

        expect(manager.increment).toHaveBeenCalledWith(expect.any(Function), { id: 'execution-1' }, 'tokens', 12)
        expect(manager.update).not.toHaveBeenCalled()
    })
})

it('preserves committed recovery references when a stale finalizer saves status and metadata', async () => {
    const recovery = {
        version: 1 as const,
        graphRevision: 'graph',
        input: { threadId: 'thread', checkpointNs: '', checkpointId: 'input' },
        latest: { threadId: 'thread', checkpointNs: '', checkpointId: 'latest' }
    }
    const current = Object.assign(new XpertAgentExecution(), {
        id: 'run',
        tenantId: 'tenant',
        organizationId: 'org',
        status: XpertAgentExecutionStatusEnum.RUNNING,
        checkpointId: 'latest',
        checkpointNs: '',
        metadata: { recovery }
    })
    const lookup = jest.spyOn(TenantOrganizationAwareCrudService.prototype, 'findOne').mockResolvedValue(current)
    const manager = {
        findOne: jest.fn().mockResolvedValue(current),
        save: jest.fn(async (value: XpertAgentExecution) => value)
    }
    const service = new XpertAgentExecutionService({
        manager: {
            transaction: async (work: (value: typeof manager) => Promise<unknown>) => work(manager)
        }
    } as unknown as Repository<XpertAgentExecution>)
    try {
        await service.update('run', {
            status: XpertAgentExecutionStatusEnum.ERROR,
            error: 'original failure',
            checkpointId: 'stale',
            metadata: {}
        })
        expect(current).toMatchObject({
            status: XpertAgentExecutionStatusEnum.ERROR,
            error: 'original failure',
            checkpointId: 'latest',
            metadata: { recovery }
        })
    } finally {
        lookup.mockRestore()
    }
})

it.each([{}, { tokens: 2, usageSummary: { lastInputTokens: 1, costs: [] } }])(
    'preserves recorded usage when a stale lifecycle snapshot finishes',
    async (snapshot) => {
        const costs = [
            { currency: 'USD', amount: 1, tokens: 12 },
            { currency: 'CNY', amount: 0.5, tokens: 12 }
        ]
        const current = Object.assign(new XpertAgentExecution(), {
            id: 'run',
            tenantId: 'tenant',
            tokens: 24,
            inputTokens: 20,
            outputTokens: 4,
            totalPrice: null,
            currency: null,
            usageSummary: { lastInputTokens: 10, costs }
        })
        const lookup = jest.spyOn(TenantOrganizationAwareCrudService.prototype, 'findOne').mockResolvedValue(current)
        const manager = { findOne: jest.fn().mockResolvedValue(current), save: jest.fn(async (value) => value) }
        const service = new XpertAgentExecutionService({ manager: { transaction: (work) => work(manager) } } as never)
        try {
            const result = await service.update('run', {
                status: XpertAgentExecutionStatusEnum.SUCCESS,
                tokens: 0,
                inputTokens: 0,
                outputTokens: 0,
                totalPrice: 1,
                currency: 'USD',
                ...snapshot
            })
            expect(result).toMatchObject({
                status: XpertAgentExecutionStatusEnum.SUCCESS,
                tokens: 24,
                inputTokens: 20,
                outputTokens: 4,
                totalPrice: null,
                currency: null,
                usageSummary: { lastInputTokens: 10, costs }
            })
        } finally {
            lookup.mockRestore()
        }
    }
)
