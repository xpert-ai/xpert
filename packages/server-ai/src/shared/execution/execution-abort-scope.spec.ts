jest.mock('@xpert-ai/server-core', () => ({ REDIS_CLIENT: 'redis' }))

import type { RedisClientType } from 'redis'
import { ExecutionCancelService } from './execution-cancel.service'
import { executionAbortScope } from './execution-abort-scope'
import { ExecutionCancelledError } from './execution-cancelled.error'

function fixture() {
    const publish = jest.fn().mockResolvedValue(1)
    const service = new ExecutionCancelService({ publish } as unknown as RedisClientType)
    const root = new AbortController()
    service.register('root', root)
    const writer = executionAbortScope('writer', service, [root.signal])
    const image = executionAbortScope('image', service, [writer.controller.signal])
    const sibling = executionAbortScope('sibling', service, [root.signal])
    return { service, root, writer, image, sibling, publish }
}

describe('execution cancellation scope', () => {
    it('cancels a selected expert and its descendants without affecting ancestors or siblings', async () => {
        const f = fixture()
        await f.service.cancelExecutions(['writer'], 'Cancelled by user')
        expect(f.writer.controller.signal.reason).toBeInstanceOf(ExecutionCancelledError)
        expect(f.image.controller.signal.reason).toBe(f.writer.controller.signal.reason)
        expect(f.sibling.controller.signal.aborted).toBe(false)
        expect(f.root.signal.aborted).toBe(false)
        expect(f.publish).toHaveBeenCalledWith(
            'ai:execution:cancel',
            JSON.stringify({ executionIds: ['writer'], reason: 'Cancelled by user' })
        )
    })

    it('cancelling a nested expert keeps its writer running', async () => {
        const f = fixture()
        await f.service.cancelExecutions(['image'], 'Cancelled by user')
        expect(f.image.controller.signal.aborted).toBe(true)
        expect(f.writer.controller.signal.aborted).toBe(false)
        expect(f.root.signal.aborted).toBe(false)
    })

    it('root cancellation still reaches every running expert', async () => {
        const f = fixture()
        await f.service.cancelExecutions(['root'], 'Cancelled by user')
        for (const scope of [f.writer, f.image, f.sibling]) expect(scope.controller.signal.aborted).toBe(true)
    })

    it('unregisters a finished scope without deleting a newer registration', async () => {
        const f = fixture()
        const newer = executionAbortScope('writer', f.service, [f.root.signal])
        f.writer.dispose()
        await f.service.cancelExecutions(['writer'], 'Cancelled by user')
        expect(newer.controller.signal.aborted).toBe(true)
        expect(f.writer.controller.signal.aborted).toBe(false)
        f.sibling.dispose()
        await f.service.cancelExecutions(['sibling'], 'Cancelled by user')
        expect(f.sibling.controller.signal.aborted).toBe(false)
    })

    it('starts aborted when its parent was already cancelled', () => {
        const f = fixture()
        f.root.abort(new Error('Parent stopped'))
        const scope = executionAbortScope('late', f.service, [f.root.signal])
        expect(scope.controller.signal.reason).toBe(f.root.signal.reason)
        scope.dispose()
    })

    it('receives scoped cancellation through Redis on a different worker', async () => {
        let receive!: (message: string) => void
        const redis = {
            duplicate: () => ({
                connect: jest.fn(),
                subscribe: jest.fn((_channel: string, listener: (message: string) => void) => {
                    receive = listener
                }),
                unsubscribe: jest.fn(),
                quit: jest.fn()
            })
        }
        const worker = new ExecutionCancelService(redis as unknown as RedisClientType)
        const root = new AbortController()
        const writer = executionAbortScope('writer', worker, [root.signal])
        const image = executionAbortScope('image', worker, [writer.controller.signal])
        await worker.onModuleInit()
        receive(JSON.stringify({ executionIds: ['writer'], reason: '已被用户取消' }))
        expect(writer.controller.signal.reason).toMatchObject({
            code: 'EXECUTION_CANCELLED_BY_USER',
            message: '已被用户取消'
        })
        expect(image.controller.signal.aborted).toBe(true)
        expect(root.signal.aborted).toBe(false)
        await worker.onModuleDestroy()
    })
})
