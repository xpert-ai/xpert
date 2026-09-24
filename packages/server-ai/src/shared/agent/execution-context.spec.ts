import { RunnableLambda } from '@langchain/core/runnables'
import { tool } from '@langchain/core/tools'
import { AsyncLocalStorageProviderSingleton } from '@langchain/core/singletons'
import { Annotation, Command, END, getConfig, interrupt, MemorySaver, START, StateGraph } from '@langchain/langgraph'
import { concat, defer, finalize, from, lastValueFrom, Observable, Subject, take, toArray } from 'rxjs'
import { z } from 'zod'
import { bindExecutionContextObservable, getExecutionContext, withExecutionContext } from './execution-context'

// A test-only extension verifies propagation without field-specific runtime code.
declare module './execution-context' {
    interface ExecutionContext {
        readonly testRequest?: Readonly<{ id: string }> | null
    }
}

const sandboxes = [{ backend: { id: 'sandbox-a' } }, { backend: { id: 'sandbox-b' } }]
const State = Annotation.Root({ value: Annotation<string>() })
const graphFor = (read: () => string | Promise<string>) =>
    new StateGraph(State)
        .addNode('probe', async () => ({ value: await read() }))
        .addEdge(START, 'probe')
        .addEdge('probe', END)
        .compile()

describe('execution context async scope', () => {
    afterEach(() => expect(getExecutionContext()).toBeUndefined())

    it('reads native graph context without establishing a host bridge', async () => {
        const context = { sandbox: sandboxes[0], testRequest: { id: 'native' } }
        const graph = graphFor(() => {
            expect(getExecutionContext()).toBe(context)
            expect(getConfig().context).toBe(context)
            return 'native'
        })
        expect((await graph.invoke({}, { context })).value).toBe('native')
    })

    it('prefers an explicit native context over the inherited bridge, including null sandbox', async () => {
        const context = { sandbox: null, testRequest: { id: 'native-child' } }
        await withExecutionContext({ sandbox: sandboxes[0] }, async () => {
            const parent = getExecutionContext()
            const graph = graphFor(() => {
                expect(getExecutionContext()).toBe(context)
                expect(getExecutionContext()?.sandbox).toBeNull()
                return 'child'
            })
            await graph.invoke({}, { context })
            expect(getExecutionContext()).toBe(parent)
        })
    })

    it('adopts native parent fields when establishing the host bridge', async () => {
        const context = { sandbox: sandboxes[0], testRequest: { id: 'native-parent' } }
        await AsyncLocalStorageProviderSingleton.runWithConfig({ context }, () =>
            withExecutionContext({ sandbox: sandboxes[1] }, async () => {
                const native = getConfig().context
                expect(native).toEqual({ ...context, sandbox: sandboxes[1] })
                expect(getExecutionContext()).toBe(native)
                await RunnableLambda.from(() => {
                    expect(getExecutionContext()).toBe(native)
                }).invoke({})
            })
        )
        expect(context.sandbox).toBe(sandboxes[0])
    })

    it('retains the same native object across Core Runnable and tool implicit-config boundaries', async () => {
        await withExecutionContext({ sandbox: sandboxes[0], testRequest: { id: 'host' } }, async () => {
            const native = getConfig().context
            expect(getExecutionContext()).toBe(native)
            expect(Object.isFrozen(native)).toBe(true)
            const read = () => {
                // Core 0.3.72 strips context from its implicit config.
                expect(getConfig()?.context).toBeUndefined()
                expect(getExecutionContext()).toBe(native)
                return 'ok'
            }
            await RunnableLambda.from(read).invoke({}, { configurable: { agentKey: 'child' } })
            const probe = tool(read, {
                name: 'context_probe',
                description: 'Read execution context',
                schema: z.object({})
            })
            expect(await probe.invoke({}, { configurable: { agentKey: 'tool' } })).toBe('ok')
            expect(getConfig().context).toBe(native)
        })
    })

    it('inherits independent fields and restores the immutable parent after partial overrides', async () => {
        const request = Object.freeze({ id: 'request-a' })
        await withExecutionContext({ sandbox: sandboxes[0], testRequest: request }, async () => {
            const parent = getExecutionContext()
            expect(Object.isFrozen(parent)).toBe(true)
            expect(getConfig().context).toBe(parent)
            expect(parent?.testRequest).toBe(request)
            expect(parent?.sandbox).toBe(sandboxes[0])
            await withExecutionContext({ testRequest: { id: 'request-b' } }, async () => {
                await Promise.resolve()
                expect(getExecutionContext()).toEqual({ sandbox: sandboxes[0], testRequest: { id: 'request-b' } })
                withExecutionContext({ sandbox: null }, () => {
                    expect(getExecutionContext()).toEqual({ sandbox: null, testRequest: { id: 'request-b' } })
                })
                expect(getExecutionContext()?.sandbox).toBe(sandboxes[0])
            })
            expect(getExecutionContext()).toBe(parent)
        })
    })

    it('inherits through graph construction, nested graphs and partial child config', async () => {
        const sandbox = sandboxes[0]
        await withExecutionContext({ sandbox }, async () => {
            await Promise.resolve()
            expect(getExecutionContext()?.sandbox).toBe(sandbox)
            const child = graphFor(async () => {
                await Promise.resolve()
                expect(getExecutionContext()?.sandbox).toBe(sandbox)
                return 'child'
            })
            const parent = graphFor(async () => {
                const result = await child.invoke({}, { configurable: { agentKey: 'child' } })
                // Runtime-created Runnables also inherit when replacing configurable.
                await RunnableLambda.from(() => {
                    expect(getExecutionContext()?.sandbox).toBe(sandbox)
                }).invoke({}, { configurable: { executionId: 'nested' } })
                return result.value
            })
            expect((await parent.invoke({})).value).toBe('child')
        })
    })

    it('isolates concurrent executions and restores nested overrides', async () => {
        await Promise.all(
            Array.from({ length: 24 }, (_, index) => {
                const sandbox = sandboxes[index % 2]
                return withExecutionContext({ sandbox, testRequest: { id: String(index) } }, async () => {
                    await new Promise((resolve) => setTimeout(resolve, index % 4))
                    expect(getExecutionContext()?.sandbox).toBe(sandbox)
                    expect(getExecutionContext()?.testRequest?.id).toBe(String(index))
                    await withExecutionContext({ sandbox: null }, async () => {
                        await Promise.resolve()
                        expect(getExecutionContext()?.sandbox).toBeNull()
                        expect(getExecutionContext()?.testRequest?.id).toBe(String(index))
                    })
                    expect(getExecutionContext()?.sandbox).toBe(sandbox)
                })
            })
        )
    })

    it('restores the parent after synchronous and asynchronous errors', async () => {
        expect(() =>
            withExecutionContext({ sandbox: sandboxes[0] }, () => {
                throw new Error('sync')
            })
        ).toThrow('sync')
        await expect(
            withExecutionContext({ sandbox: sandboxes[1] }, async () => {
                throw new Error('async')
            })
        ).rejects.toThrow('async')
    })

    it('preserves parent config, tags, metadata and callbacks', async () => {
        const handleChainStart = jest.fn()
        await AsyncLocalStorageProviderSingleton.runWithConfig(
            { tags: ['parent'], metadata: { marker: 'parent' }, configurable: { thread_id: 'parent' } },
            () =>
                withExecutionContext({ sandbox: sandboxes[0] }, async () => {
                    const graph = graphFor(() => {
                        expect(getConfig().tags).toContain('parent')
                        expect(getConfig().metadata.marker).toBe('parent')
                        expect(getConfig().configurable.thread_id).toBe('parent')
                        return 'ok'
                    })
                    await graph.invoke({}, { callbacks: [{ handleChainStart }] })
                })
        )
        expect(handleChainStart).toHaveBeenCalled()
    })

    it('binds delayed subscription, actual graph streaming and post-stream work', async () => {
        const sandbox = sandboxes[0]
        let started = false
        const source = bindExecutionContextObservable({ sandbox }, () => {
            started = true
            const graph = graphFor(() => {
                expect(getExecutionContext()?.sandbox).toBe(sandbox)
                return 'ok'
            })
            return concat(
                defer(() => from(graph.streamEvents({}, { version: 'v2' }))),
                defer(async () => {
                    await Promise.resolve()
                    expect(getExecutionContext()?.sandbox).toBe(sandbox)
                    return { final: true }
                })
            )
        })
        expect(started).toBe(false)
        expect(getExecutionContext()).toBeUndefined()
        const events = await lastValueFrom(source.pipe(toArray()))
        expect(events.at(-1)).toEqual({ final: true })
        expect(started).toBe(true)
    })

    it('binds cancellation initiated outside the scope', () => {
        const cleanup = jest.fn(() => expect(getExecutionContext()?.sandbox).toBe(sandboxes[0]))
        const source = bindExecutionContextObservable({ sandbox: sandboxes[0] }, () => new Observable(() => cleanup))
        const subscription = source.subscribe()
        expect(getExecutionContext()).toBeUndefined()
        subscription.unsubscribe()
        expect(cleanup).toHaveBeenCalledTimes(1)
    })

    it.each([undefined, { id: 'creator' }])(
        'captures all fields at binding without inheriting the subscriber context: %j',
        (testRequest) => {
            const subject = new Subject<number>()
            const captured = { sandbox: sandboxes[0], testRequest }
            const notifications = jest.fn(() => getExecutionContext())
            const cleanup = jest.fn(() => getExecutionContext())
            const factory = jest.fn(() => {
                expect(getExecutionContext()).toEqual(captured)
                expect(getConfig().context).toBe(getExecutionContext())
                return subject.pipe(finalize(cleanup))
            })
            const bound = withExecutionContext(captured, () => bindExecutionContextObservable({}, factory))
            expect(factory).not.toHaveBeenCalled()

            withExecutionContext({ sandbox: sandboxes[1], testRequest: { id: 'subscriber' } }, () => {
                const subscription = bound.subscribe({ next: notifications, complete: notifications })
                subject.next(1)
                subject.complete()
                expect(subscription.closed).toBe(true)
                expect(getExecutionContext()?.testRequest?.id).toBe('subscriber')
            })

            expect(notifications).toHaveBeenCalledTimes(2)
            for (const result of notifications.mock.results) expect(result.value).toEqual(captured)
            expect(cleanup).toHaveBeenCalledTimes(1)
            expect(cleanup.mock.results[0].value).toEqual(captured)
        }
    )

    it.each(['complete', 'error'] as const)('binds cleanup when a source signals %s outside the scope', (terminal) => {
        const source = new Subject<number>()
        const cleanup = jest.fn(() => getExecutionContext())
        const onError = jest.fn()
        const subscription = bindExecutionContextObservable({ sandbox: sandboxes[0] }, () =>
            source.pipe(finalize(cleanup))
        ).subscribe({
            error: onError
        })

        expect(getExecutionContext()).toBeUndefined()
        if (terminal === 'complete') source.complete()
        else source.error(new Error('source failed'))

        expect(subscription.closed).toBe(true)
        expect(onError).toHaveBeenCalledTimes(terminal === 'error' ? 1 : 0)
        expect(cleanup).toHaveBeenCalledTimes(1)
        expect(cleanup.mock.results[0].value?.sandbox).toBe(sandboxes[0])
    })

    it('stops synchronous producers immediately on downstream cancellation', async () => {
        let emitted = 0
        const cleanup = jest.fn(() => expect(getExecutionContext()?.sandbox).toBe(sandboxes[0]))
        const source = bindExecutionContextObservable(
            { sandbox: sandboxes[0] },
            () =>
                new Observable<number>((subscriber) => {
                    while (!subscriber.closed && emitted < 3) subscriber.next(++emitted)
                    return cleanup
                })
        )
        expect(await lastValueFrom(source.pipe(take(1)))).toBe(1)
        expect(emitted).toBe(1)
        expect(cleanup).toHaveBeenCalledTimes(1)
    })

    it('propagates subscription errors without leaking context', async () => {
        const source = bindExecutionContextObservable({ sandbox: sandboxes[0] }, () => {
            expect(getExecutionContext()?.sandbox).toBe(sandboxes[0])
            throw new Error('factory failed')
        })
        await expect(lastValueFrom(source)).rejects.toThrow('factory failed')
    })

    it('uses the new scope after checkpoint resume without persisting backend references', async () => {
        const saver = new MemorySaver()
        const graph = new StateGraph(State)
            .addNode('probe', () => {
                interrupt('approve')
                expect(getExecutionContext()?.sandbox).toBe(sandboxes[1])
                return { value: 'resumed' }
            })
            .addEdge(START, 'probe')
            .addEdge('probe', END)
            .compile({ checkpointer: saver })
        const config = { configurable: { thread_id: 'resume' } }
        await withExecutionContext({ sandbox: sandboxes[0] }, () => graph.invoke({}, config))
        const result = await withExecutionContext({ sandbox: sandboxes[1] }, () =>
            graph.invoke(new Command({ resume: true }), config)
        )
        expect(result.value).toBe('resumed')
        for await (const tuple of saver.list(config)) expect(JSON.stringify(tuple)).not.toContain('"backend"')
    })
})
