import { ConflictException } from '@nestjs/common'
import { QueryBus } from '@nestjs/cqrs'
import { resolveRetryInputCheckpointId } from './retry-checkpoint'

it('reports unavailable recovery instead of a missing-checkpoint 400 and never guesses the latest state', async () => {
    const execute = jest.fn()
    const queryBus = { execute } as unknown as QueryBus
    let failure: unknown
    try {
        await resolveRetryInputCheckpointId(queryBus, 'thread', '', null)
    } catch (error) {
        failure = error
    }
    expect(failure).toBeInstanceOf(ConflictException)
    expect(failure).toMatchObject({
        response: { code: 'conversation_recovery_unavailable' }
    })
    expect(execute).not.toHaveBeenCalled()
})

function retryFixture() {
    const execute = jest.fn()
    const execution = {
        id: 'execution',
        error: 'Original tool failure',
        metadata: {
            recovery: {
                version: 1 as const,
                graphRevision: 'graph',
                input: { threadId: 'thread', checkpointNs: '', checkpointId: 'input' },
                latest: { threadId: 'thread', checkpointNs: '', checkpointId: 'loop' }
            }
        }
    }
    const tuple = (id: string, source: 'input' | 'loop', parent?: string) => ({
        config: { configurable: { thread_id: 'thread', checkpoint_ns: '', checkpoint_id: id } },
        metadata: { source },
        ...(parent
            ? { parentConfig: { configurable: { thread_id: 'thread', checkpoint_ns: '', checkpoint_id: parent } } }
            : {})
    })
    const resolve = (requestedCheckpointId?: string, graphRevision = 'graph') =>
        resolveRetryInputCheckpointId({ execute } as unknown as QueryBus, 'thread', '', 'loop', {
            execution,
            requestedCheckpointId,
            graphRevision
        })
    return { execute, execution, tuple, resolve }
}

it('uses the durable input directly, never the latest loop, and preserves the original failure', async () => {
    const f = retryFixture()
    f.execute.mockResolvedValue(f.tuple('input', 'input'))
    await expect(f.resolve()).resolves.toBe('input')
    expect(f.execute).toHaveBeenCalledWith(
        expect.objectContaining({
            configurable: {
                thread_id: 'thread',
                checkpoint_ns: '',
                checkpoint_id: 'input'
            }
        })
    )
    f.execute.mockResolvedValue(null)
    await expect(f.resolve()).rejects.toMatchObject({
        response: { code: 'conversation_recovery_unavailable' },
        cause: { originalError: 'Original tool failure' }
    })
})

it('rejects graph drift and client-supplied loop checkpoints', async () => {
    const f = retryFixture()
    await expect(f.resolve(undefined, 'changed')).rejects.toMatchObject({
        response: { code: 'conversation_graph_changed' }
    })
    expect(f.execute).not.toHaveBeenCalled()
    f.execute.mockResolvedValue(f.tuple('input', 'input'))
    await expect(f.resolve('loop')).rejects.toBeInstanceOf(ConflictException)
})

it.each(['loop', 'foreign', 'missing'] as const)('rejects a corrupt persisted input boundary (%s)', async (kind) => {
    const f = retryFixture()
    const tuple = f.tuple('input', kind === 'loop' ? 'loop' : 'input')
    if (kind === 'foreign') tuple.config.configurable.thread_id = 'other-thread'
    f.execute.mockResolvedValue(kind === 'missing' ? null : tuple)
    await expect(f.resolve()).rejects.toBeInstanceOf(ConflictException)
    expect(f.execute).toHaveBeenCalledTimes(1)
})

it('accepts only bounded, same-thread ancestry for legacy executions', async () => {
    const f = retryFixture()
    f.execute.mockResolvedValueOnce(f.tuple('loop', 'loop', 'input')).mockResolvedValueOnce(f.tuple('input', 'input'))
    await expect(
        resolveRetryInputCheckpointId({ execute: f.execute } as unknown as QueryBus, 'thread', '', 'loop')
    ).resolves.toBe('input')
    f.execute.mockResolvedValue(f.tuple('loop', 'loop', 'loop'))
    await expect(
        resolveRetryInputCheckpointId({ execute: f.execute } as unknown as QueryBus, 'thread', '', 'loop')
    ).rejects.toBeInstanceOf(ConflictException)
})

it('does not turn database failures into a misleading missing recovery error', async () => {
    const f = retryFixture()
    f.execute.mockRejectedValue(new Error('database unavailable'))
    await expect(f.resolve()).rejects.toThrow('database unavailable')
})

it('rejects legacy subgraph checkpoints instead of applying them to the root workflow', async () => {
    const execute = jest.fn()
    await expect(
        resolveRetryInputCheckpointId({ execute } as unknown as QueryBus, 'thread', 'tool:child', 'input')
    ).rejects.toBeInstanceOf(ConflictException)
    expect(execute).not.toHaveBeenCalled()
})
