import { _BaseToolset } from '../../../shared'

type ClosableGraphMethod = (...args: unknown[]) => unknown

type ToolsetRuntimeCleanupLogger = {
    debug(message: unknown, ...optionalParams: unknown[]): unknown
}

type ToolsetRuntimeCleanupOptions = {
    toolsets: _BaseToolset[]
    abortSignal: AbortSignal
    rootController: AbortController
    logger: ToolsetRuntimeCleanupLogger
}

type ToolsetRuntimeCleanup = {
    closeToolsets: () => Promise<void>
    installGraphCloseHook: (graph: unknown) => void
}

const graphRuntimeCleanups = new WeakMap<AbortController, Set<() => Promise<void>>>()

function isAsyncIterable(value: unknown): value is AsyncIterable<unknown> {
    return (
        Boolean(value) &&
        (typeof value === 'object' || typeof value === 'function') &&
        typeof Reflect.get(value as object, Symbol.asyncIterator) === 'function'
    )
}

function closeAsyncIterableOnCompletion<T>(iterable: AsyncIterable<T>, close: () => Promise<void>): AsyncIterable<T> {
    return {
        async *[Symbol.asyncIterator]() {
            try {
                for await (const item of iterable) {
                    yield item
                }
            } finally {
                await close()
            }
        }
    }
}

function installGraphCloseHook(graph: Record<string, unknown>, close: () => Promise<void>) {
    const invoke = graph.invoke as ClosableGraphMethod | undefined
    if (typeof invoke === 'function') {
        graph.invoke = async (...args: unknown[]) => {
            try {
                return await invoke.apply(graph, args)
            } finally {
                await close()
            }
        }
    }

    for (const methodName of ['stream', 'streamEvents', 'streamLog']) {
        const method = graph[methodName] as ClosableGraphMethod | undefined
        if (typeof method !== 'function') {
            continue
        }
        graph[methodName] = (...args: unknown[]) => {
            const result = method.apply(graph, args)
            if (isAsyncIterable(result)) {
                return closeAsyncIterableOnCompletion(result as AsyncIterable<unknown>, close)
            }
            if (result && typeof Reflect.get(result as object, 'then') === 'function') {
                return Promise.resolve(result).then((resolved) =>
                    isAsyncIterable(resolved) ? closeAsyncIterableOnCompletion(resolved, close) : resolved
                )
            }
            return result
        }
    }
}

function registerGraphRuntimeCleanup(rootController: AbortController, close: () => Promise<void>) {
    let cleanups = graphRuntimeCleanups.get(rootController)
    const shouldInstallGraphHook = !cleanups
    if (!cleanups) {
        cleanups = new Set()
        graphRuntimeCleanups.set(rootController, cleanups)
    }
    cleanups.add(close)
    return shouldInstallGraphHook
}

async function closeGraphRuntimeCleanups(rootController: AbortController) {
    const cleanups = graphRuntimeCleanups.get(rootController)
    if (!cleanups?.size) {
        return
    }
    graphRuntimeCleanups.delete(rootController)
    await Promise.all(Array.from(cleanups).map((close) => close()))
}

export function createToolsetRuntimeCleanup(options: ToolsetRuntimeCleanupOptions): ToolsetRuntimeCleanup {
    const { abortSignal, logger, rootController, toolsets } = options
    let toolsetsClosed = false

    const closeToolsets = async () => {
        if (toolsetsClosed) {
            return
        }
        toolsetsClosed = true
        await Promise.all(toolsets.map((toolset) => toolset.close().catch((err) => logger.debug(err))))
    }

    abortSignal.addEventListener(
        'abort',
        () => {
            closeToolsets().catch((err) => logger.debug(err))
        },
        { once: true }
    )

    const shouldInstallGraphCloseHook = registerGraphRuntimeCleanup(rootController, closeToolsets)

    return {
        closeToolsets,
        installGraphCloseHook: (graph) => {
            if (!shouldInstallGraphCloseHook) {
                return
            }
            installGraphCloseHook(graph as Record<string, unknown>, () => closeGraphRuntimeCleanups(rootController))
        }
    }
}
