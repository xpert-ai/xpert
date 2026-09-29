// Invariants:
// Native LangGraph config.context owns host runtime references, never graph state.
// Core 0.3.x drops context from implicit config; the bridge retains the same object.
// Nested scopes inherit omitted fields; explicit null masks a parent value.
// Deferred streams capture context at binding and restore it through teardown.
import { getContextVariable, setContextVariable } from '@langchain/core/context'
import { AsyncLocalStorageProviderSingleton } from '@langchain/core/singletons'
import { getConfig, type LangGraphRunnableConfig } from '@langchain/langgraph'
import type { TSandboxConfigurable } from '@xpert-ai/contracts'
import { Observable, Subject, takeUntil, type Subscription } from 'rxjs'

/** Add typed host context fields here; propagation needs no field-specific changes. */
export interface ExecutionContext {
    /** Undefined permits legacy config fallback; null explicitly disables inheritance. */
    readonly sandbox?: TSandboxConfigurable | null
}

const EXECUTION_CONTEXT_BRIDGE = Symbol.for('xpert:execution-context')

export function getExecutionContext(): Readonly<ExecutionContext> | undefined {
    const config: LangGraphRunnableConfig<ExecutionContext> | undefined = getConfig()
    return config?.context ?? getContextVariable<Readonly<ExecutionContext>>(EXECUTION_CONTEXT_BRIDGE)
}

/** Shallowly override the parent context without mutating it or cloning runtime resources. */
export function withExecutionContext<T>(context: ExecutionContext, operation: () => T): T {
    return runWithExecutionContext(captureExecutionContext(context), operation)
}

function captureExecutionContext(context: ExecutionContext): Readonly<ExecutionContext> {
    return Object.freeze({ ...getExecutionContext(), ...context })
}

function runWithExecutionContext<T>(context: Readonly<ExecutionContext>, operation: () => T): T {
    const config: LangGraphRunnableConfig<ExecutionContext> = { ...getConfig(), context }
    return AsyncLocalStorageProviderSingleton.runWithConfig(config, () => {
        setContextVariable(EXECUTION_CONTEXT_BRIDGE, config.context)
        return operation()
    })
}

/** Capture now, subscribe lazily, and re-enter the same context for notifications and cleanup. */
export function bindExecutionContextObservable<T>(
    context: ExecutionContext,
    factory: () => Observable<T>
): Observable<T> {
    const snapshot = captureExecutionContext(context)
    const run = <R>(operation: () => R): R => runWithExecutionContext(snapshot, operation)
    return new Observable<T>((subscriber) => {
        const cancelled = new Subject<void>()
        let subscription: Subscription | undefined
        // Register before subscribing so synchronous cancellation also stops the source.
        subscriber.add(() =>
            run(() => {
                cancelled.next()
                cancelled.complete()
                // Terminal notifications may already be in progress outside this scope.
                subscription?.unsubscribe()
            })
        )
        subscription = run(() =>
            factory()
                .pipe(takeUntil(cancelled))
                .subscribe({
                    next: (value) => run(() => subscriber.next(value)),
                    error: (error) => run(() => subscriber.error(error)),
                    complete: () => run(() => subscriber.complete())
                })
        )
    })
}
