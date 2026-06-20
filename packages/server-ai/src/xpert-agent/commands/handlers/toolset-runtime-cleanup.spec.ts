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
