import { _BaseToolset } from '../../../shared'
import { createToolsetRuntimeCleanup } from './toolset-runtime-cleanup'

const createToolset = (close: jest.Mock<Promise<void>, []>) => ({ close }) as unknown as _BaseToolset

describe('createToolsetRuntimeCleanup', () => {
    const logger = { debug: jest.fn() }

    beforeEach(() => {
        jest.clearAllMocks()
    })

    it('closes all toolsets registered under the root graph when invoke completes', async () => {
        const rootController = new AbortController()
        const rootToolsetClose = jest.fn<Promise<void>, []>().mockResolvedValue(undefined)
        const nestedToolsetClose = jest.fn<Promise<void>, []>().mockResolvedValue(undefined)

        const rootCleanup = createToolsetRuntimeCleanup({
            toolsets: [createToolset(rootToolsetClose)],
            abortSignal: new AbortController().signal,
            rootController,
            logger
        })
        const nestedCleanup = createToolsetRuntimeCleanup({
            toolsets: [createToolset(nestedToolsetClose)],
            abortSignal: new AbortController().signal,
            rootController,
            logger
        })
        const graph = {
            invoke: jest.fn().mockResolvedValue('done')
        }

        rootCleanup.installGraphCloseHook(graph)
        nestedCleanup.installGraphCloseHook(graph)

        await expect(graph.invoke()).resolves.toBe('done')
        await expect(graph.invoke()).resolves.toBe('done')

        expect(rootToolsetClose).toHaveBeenCalledTimes(1)
        expect(nestedToolsetClose).toHaveBeenCalledTimes(1)
    })

    it('preserves async iterator next() for wrapped graph streams', async () => {
        const rootController = new AbortController()
        const toolsetClose = jest.fn<Promise<void>, []>().mockResolvedValue(undefined)

        const cleanup = createToolsetRuntimeCleanup({
            toolsets: [createToolset(toolsetClose)],
            abortSignal: new AbortController().signal,
            rootController,
            logger
        })
        const graph = {
            stream: jest.fn(() =>
                (async function* () {
                    yield 'chunk'
                })()
            ),
            streamEvents: jest.fn(function (this: { stream: () => AsyncGenerator<string, void, unknown> }) {
                const graph = this
                return (async function* () {
                    const outputStream = graph.stream()
                    yield (await outputStream.next()).value
                })()
            })
        }

        cleanup.installGraphCloseHook(graph)

        const stream = graph.stream()
        expect(typeof stream.next).toBe('function')
        await expect(stream.next()).resolves.toMatchObject({ value: 'chunk', done: false })
        await expect(stream.next()).resolves.toMatchObject({ done: true })

        const events = graph.streamEvents()
        expect(typeof events.next).toBe('function')
        await expect(events.next()).resolves.toMatchObject({ value: 'chunk', done: false })
        await expect(events.next()).resolves.toMatchObject({ done: true })
        expect(toolsetClose).toHaveBeenCalledTimes(1)
    })

    it('closes toolsets when the subgraph abort signal fires', async () => {
        const rootController = new AbortController()
        const abortController = new AbortController()
        let closeFinished!: () => void
        const closePromise = new Promise<void>((resolve) => {
            closeFinished = resolve
        })
        const toolsetClose = jest.fn<Promise<void>, []>().mockImplementation(async () => closeFinished())

        createToolsetRuntimeCleanup({
            toolsets: [createToolset(toolsetClose)],
            abortSignal: abortController.signal,
            rootController,
            logger
        })

        abortController.abort()
        await closePromise

        expect(toolsetClose).toHaveBeenCalledTimes(1)
    })
})
