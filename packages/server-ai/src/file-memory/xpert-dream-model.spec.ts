import type { CommandBus, QueryBus } from '@nestjs/cqrs'
import { ForbiddenException } from '@nestjs/common'
import { RequestContext } from '@xpert-ai/plugin-sdk'
import { XpertDreamModel } from './adapters/xpert-dream-model'
import type { XpertService } from '../xpert/xpert.service'

jest.mock('../xpert/xpert.service', () => ({ XpertService: class XpertService {} }))

describe('Dream model selection', () => {
    const scope = { id: 'assistant', tenantId: 'tenant', organizationId: 'org', userId: 'user' }
    const get = jest.fn(),
        execute = jest.fn()
    const runtime = new XpertDreamModel(
        { findOneForRuntime: get } as unknown as XpertService,
        { execute } as unknown as QueryBus,
        { execute: jest.fn() } as unknown as CommandBus
    )
    afterEach(() => {
        jest.restoreAllMocks()
        jest.clearAllMocks()
    })
    it.each([
        ['primary-model', 'primary-model'],
        [undefined, 'team-model']
    ])('resolves %s on the target assistant', async (primary, expected) => {
        const assistant = {
            ...scope,
            agent: { copilotModel: primary ? { model: primary } : null },
            copilotModel: { model: 'team-model' }
        }
        get.mockResolvedValue(assistant)
        execute.mockResolvedValue('model instance')
        expect(await runtime.resolve(scope, 'dream_a')).toEqual({ name: expected, model: 'model instance' })
        expect(get.mock.calls[0][0]).toBe(scope.id)
        expect(execute.mock.calls[0][0]).toMatchObject({
            xpert: assistant,
            agent: assistant.agent,
            options: { copilotModel: { model: expected } }
        })
    })
    it('fails before resolving a model when the target tenant differs', async () => {
        get.mockResolvedValue({ tenantId: 'other' })
        await expect(runtime.resolve(scope, 'dream_a')).rejects.toBeInstanceOf(ForbiddenException)
        expect(execute).not.toHaveBeenCalled()
    })
    it('rejects an actor mismatch before entering background work', async () => {
        jest.spyOn(RequestContext, 'currentUserId').mockReturnValue('other')
        const work = jest.fn()
        await expect(runtime.withActor(scope, work)).rejects.toBeInstanceOf(ForbiddenException)
        expect(work).not.toHaveBeenCalled()
    })
})
