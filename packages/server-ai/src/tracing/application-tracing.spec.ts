import { Observable } from 'rxjs'
import { ApplicationTracing, TracingDriver, TracingSpan } from './application-tracing'

class FakeSpan implements TracingSpan {
    ended = 0
    status: string | null = null
    exceptions: unknown[] = []
    attributes: Record<string, string | number | boolean> = {}

    setAttributes(attributes: Record<string, string | number | boolean>) {
        this.attributes = {
            ...this.attributes,
            ...attributes
        }
    }

    recordException(error: unknown) {
        this.exceptions.push(error)
    }

    setError() {
        this.status = 'error'
    }

    end() {
        this.ended += 1
    }
}

class FakeTracingDriver implements TracingDriver {
    spans: FakeSpan[] = []

    constructor(private readonly enabledValue: boolean) {}

    enabled() {
        return this.enabledValue
    }

    startSpan() {
        const span = new FakeSpan()
        this.spans.push(span)
        return span
    }

    withSpan<T>(_span: TracingSpan, handler: () => T): T {
        return handler()
    }
}

describe('ApplicationTracing', () => {
    it('does not create spans when tracing is disabled', async () => {
        const driver = new FakeTracingDriver(false)
        const tracing = new ApplicationTracing(driver)

        const result = await tracing.traceAsync('xpert.chat', { action: 'send' }, async () => 'ok')

        expect(result).toBe('ok')
        expect(driver.spans).toHaveLength(0)
    })

    it('records async errors and ends the span once', async () => {
        const driver = new FakeTracingDriver(true)
        const tracing = new ApplicationTracing(driver)
        const error = new Error('failed')

        await expect(
            tracing.traceAsync('llm.call', { provider: 'openai' }, async () => {
                throw error
            })
        ).rejects.toThrow(error)

        expect(driver.spans).toHaveLength(1)
        expect(driver.spans[0].exceptions).toEqual([error])
        expect(driver.spans[0].status).toBe('error')
        expect(driver.spans[0].ended).toBe(1)
    })

    it('ends observable spans once on normal completion', async () => {
        const driver = new FakeTracingDriver(true)
        const tracing = new ApplicationTracing(driver)

        await new Promise<void>((resolve, reject) => {
            tracing
                .traceObservable(
                    new Observable<string>((subscriber) => {
                        subscriber.next('event')
                        subscriber.complete()
                    }),
                    'xpert.chat',
                    { action: 'send' }
                )
                .subscribe({
                    error: reject,
                    complete: resolve
                })
        })

        expect(driver.spans).toHaveLength(1)
        expect(driver.spans[0].ended).toBe(1)
    })

    it('ends observable spans once on unsubscribe', () => {
        const driver = new FakeTracingDriver(true)
        const tracing = new ApplicationTracing(driver)
        let cleanupCount = 0

        const subscription = tracing
            .traceObservable(
                new Observable<string>(() => {
                    return () => {
                        cleanupCount += 1
                    }
                }),
                'xpert.chat'
            )
            .subscribe()

        subscription.unsubscribe()

        expect(cleanupCount).toBe(1)
        expect(driver.spans).toHaveLength(1)
        expect(driver.spans[0].ended).toBe(1)
    })
})
