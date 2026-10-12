jest.mock('@xpert-ai/plugin-sdk', () => ({
    RequestContext: {
        currentTenantId: jest.fn(() => 'tenant-1'),
        getOrganizationId: jest.fn(() => 'organization-1')
    }
}))
jest.mock('i18next', () => ({
    t: (key: string, options?: { defaultValue?: string }) => options?.defaultValue ?? key
}))

import { BadRequestException, GatewayTimeoutException } from '@nestjs/common'
import { QueryBus } from '@nestjs/cqrs'
import { AiModelTypeEnum, AiProviderRole, ICopilot } from '@xpert-ai/contracts'
import { CopilotModelGetChatModelQuery } from '../copilot-model/queries/get-chat-model.query'
import { CopilotOneByRoleQuery } from './queries/get-one-by-role.query'
import { PrimaryModelSmokeService } from './primary-model-smoke.service'

function fixture() {
    const copilot: ICopilot = {
        id: 'copilot-1',
        role: AiProviderRole.Primary,
        enabled: true,
        copilotModel: {
            copilotId: 'copilot-1',
            model: 'selected-model',
            modelType: AiModelTypeEnum.LLM,
            options: { max_tokens: 8192, temperature: 0.3 }
        }
    }
    const invoke = jest.fn().mockResolvedValue({ content: 'OK' })
    const execute = jest
        .fn()
        .mockImplementation(async (query: CopilotOneByRoleQuery | CopilotModelGetChatModelQuery) => {
            if (query instanceof CopilotOneByRoleQuery) return copilot
            if (query instanceof CopilotModelGetChatModelQuery) return { invoke }
            throw new Error('Unexpected query')
        })
    return { copilot, invoke, execute, service: new PrimaryModelSmokeService({ execute } as unknown as QueryBus) }
}

describe('PrimaryModelSmokeService', () => {
    beforeEach(() => jest.useFakeTimers())
    afterEach(() => {
        jest.useRealTimers()
        jest.restoreAllMocks()
    })

    it('uses the current organization Primary LLM, caps output, and returns no model content', async () => {
        const f = fixture()
        await expect(f.service.verify()).resolves.toBeUndefined()
        expect(f.execute).toHaveBeenNthCalledWith(
            1,
            expect.objectContaining({
                tenantId: 'tenant-1',
                organizationId: 'organization-1',
                role: AiProviderRole.Primary,
                relations: ['copilotModel']
            })
        )
        const modelQuery = f.execute.mock.calls[1][0]
        expect(modelQuery).toBeInstanceOf(CopilotModelGetChatModelQuery)
        expect(modelQuery.copilotModel.options).toEqual({ max_tokens: 16, temperature: 0.3 })
        expect(f.copilot.copilotModel.options.max_tokens).toBe(8192)
        expect(f.invoke).toHaveBeenCalledTimes(1)
        expect(f.invoke).toHaveBeenCalledWith('Reply with OK.', { signal: modelQuery.options.abortController.signal })
        expect(modelQuery.options.abortController.signal.aborted).toBe(false)
        expect(jest.getTimerCount()).toBe(0)
    })

    it.each([
        null,
        { id: 'copilot-1', enabled: false, copilotModel: { model: 'selected-model' } },
        { id: 'copilot-1', copilotModel: { model: '   ' } },
        { id: 'copilot-1', copilotModel: { model: 'embedding-model', modelType: AiModelTypeEnum.TEXT_EMBEDDING } }
    ])('does not construct or invoke a model when Primary is unavailable: %j', async (copilot) => {
        const f = fixture()
        f.execute.mockResolvedValueOnce(copilot)
        await expect(f.service.verify()).rejects.toBeInstanceOf(BadRequestException)
        expect(f.execute).toHaveBeenCalledTimes(1)
        expect(f.invoke).not.toHaveBeenCalled()
        expect(jest.getTimerCount()).toBe(0)
    })

    it('rejects an empty response and cleans up its timeout', async () => {
        const f = fixture()
        f.invoke.mockResolvedValue({ content: '' })
        await expect(f.service.verify()).rejects.toThrow('empty response')
        expect(jest.getTimerCount()).toBe(0)
    })

    it('propagates a provider error without leaving a deadline timer', async () => {
        const f = fixture()
        const failure = new Error('Provider rejected verification')
        f.invoke.mockRejectedValue(failure)
        await expect(f.service.verify()).rejects.toBe(failure)
        expect(jest.getTimerCount()).toBe(0)
    })

    it('returns at 20 seconds and aborts even when model invocation ignores the signal', async () => {
        const f = fixture()
        f.invoke.mockImplementation(() => new Promise(() => undefined))
        let settled = false
        const result = f.service.verify().then(
            () => {
                settled = true
                return null
            },
            (error: unknown) => {
                settled = true
                return error
            }
        )
        await jest.advanceTimersByTimeAsync(19999)
        expect(f.invoke).toHaveBeenCalledTimes(1)
        expect(settled).toBe(false)
        await jest.advanceTimersByTimeAsync(1)
        const error = await result
        expect(error).toBeInstanceOf(GatewayTimeoutException)
        expect(error instanceof GatewayTimeoutException && error.getStatus()).toBe(504)
        expect(f.execute.mock.calls[1][0].options.abortController.signal.aborted).toBe(true)
        expect(jest.getTimerCount()).toBe(0)
    })

    it('does not start inference if model construction finishes after the deadline', async () => {
        const f = fixture()
        let finishModel: (value: { invoke: typeof f.invoke }) => void = () => undefined
        const pending = new Promise<{ invoke: typeof f.invoke }>((resolve) => {
            finishModel = resolve
        })
        f.execute.mockImplementation(async (query) => (query instanceof CopilotOneByRoleQuery ? f.copilot : pending))
        const result = f.service.verify().catch((error: unknown) => error)
        await jest.advanceTimersByTimeAsync(20000)
        expect(await result).toBeInstanceOf(GatewayTimeoutException)
        finishModel({ invoke: f.invoke })
        await jest.advanceTimersByTimeAsync(0)
        expect(f.invoke).not.toHaveBeenCalled()
    })

    it('bounds a stalled Primary model lookup as part of the same deadline', async () => {
        const f = fixture()
        f.execute.mockImplementation(() => new Promise(() => undefined))
        const result = f.service.verify().catch((error: unknown) => error)
        await jest.advanceTimersByTimeAsync(20000)
        expect(await result).toBeInstanceOf(GatewayTimeoutException)
        expect(f.invoke).not.toHaveBeenCalled()
        expect(jest.getTimerCount()).toBe(0)
    })
})
