import { NodeInterrupt } from '@langchain/langgraph'
import { ExecutionCancelledError } from '../../execution-control/execution-cancelled.error'
import { runIteration } from './run-iteration'

describe.each([false, true])('iteration with parallel=%s', (parallel) => {
    it.each([undefined, 'ignore', 'remove', 'terminate'] as const)(
        'propagates control signals in mode %s',
        async (errorMode) => {
            for (const error of [new NodeInterrupt('wait'), new ExecutionCancelledError('child', 'terminated')]) {
                const invoke = jest.fn(async () => {
                    throw error
                })
                await expect(
                    runIteration([1, 2], { parallel, maximum: 1, errorMode }, undefined, invoke, jest.fn())
                ).rejects.toBe(error)
                expect(invoke).toHaveBeenCalledTimes(1)
            }
        }
    )

    it.each([undefined, 'ignore', 'remove', 'terminate'] as const)(
        'preserves ordinary item error handling in mode %s',
        async (errorMode) => {
            const error = new Error('Malformed PDF')
            const result = runIteration(
                [1, 2],
                { parallel, errorMode },
                undefined,
                async (item) => {
                    if (item === 1) throw error
                    return 'converted'
                },
                jest.fn()
            )
            if (errorMode === 'terminate') await expect(result).rejects.toBe(error)
            else expect(await result).toEqual(errorMode === 'remove' ? ['converted'] : [null, 'converted'])
        }
    )
})

it('signals already running siblings and waits for their cleanup before reporting termination', async () => {
    const calls: number[] = []
    let started: () => void
    const secondStarted = new Promise<void>((resolve) => {
        started = resolve
    })
    const error = new ExecutionCancelledError('child', 'terminated')
    let settled = false
    const result = runIteration(
        [1, 2, 3],
        { parallel: true, maximum: 2, errorMode: 'ignore' },
        undefined,
        async (item, _index, signal) => {
            calls.push(item)
            if (item === 1) {
                await secondStarted
                throw error
            }
            started()
            await new Promise<void>((resolve) => signal.addEventListener('abort', () => resolve(), { once: true }))
            settled = true
        },
        jest.fn()
    )
    await expect(result).rejects.toBe(error)
    expect(calls).toEqual([1, 2])
    expect(settled).toBe(true)
})
