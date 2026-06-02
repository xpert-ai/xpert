import { context, Span, SpanStatusCode, trace } from '@opentelemetry/api'
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http'
import { resourceFromAttributes } from '@opentelemetry/resources'
import { BatchSpanProcessor, ParentBasedSampler, TraceIdRatioBasedSampler } from '@opentelemetry/sdk-trace-base'
import { NodeTracerProvider } from '@opentelemetry/sdk-trace-node'
import { Observable } from 'rxjs'

export type TracingAttributeValue = string | number | boolean
export type TracingAttributes = Record<string, TracingAttributeValue | null | undefined>

export interface TracingSpan {
    setAttributes(attributes: Record<string, TracingAttributeValue>): void
    recordException(error: unknown): void
    setError(): void
    end(): void
}

export interface TracingDriver {
    enabled(): boolean
    startSpan(name: string, attributes?: Record<string, TracingAttributeValue>): TracingSpan
    withSpan<T>(span: TracingSpan, handler: () => T): T
}

class NoopTracingDriver implements TracingDriver {
    enabled() {
        return false
    }

    startSpan(): TracingSpan {
        return {
            setAttributes: () => undefined,
            recordException: () => undefined,
            setError: () => undefined,
            end: () => undefined
        }
    }

    withSpan<T>(_span: TracingSpan, handler: () => T): T {
        return handler()
    }
}

class OpenTelemetrySpanAdapter implements TracingSpan {
    constructor(readonly span: Span) {}

    setAttributes(attributes: Record<string, TracingAttributeValue>) {
        this.span.setAttributes(attributes)
    }

    recordException(error: unknown) {
        if (error instanceof Error) {
            this.span.recordException(error)
            return
        }

        this.span.recordException(String(error))
    }

    setError() {
        this.span.setStatus({ code: SpanStatusCode.ERROR })
    }

    end() {
        this.span.end()
    }
}

class OpenTelemetryTracingDriver implements TracingDriver {
    private readonly tracer = trace.getTracer('xpert-ai.server-ai')

    enabled() {
        return isOpenTelemetryTracingEnabled() && !!tracerProvider
    }

    startSpan(name: string, attributes?: Record<string, TracingAttributeValue>): TracingSpan {
        return new OpenTelemetrySpanAdapter(this.tracer.startSpan(name, { attributes }))
    }

    withSpan<T>(span: TracingSpan, handler: () => T): T {
        if (span instanceof OpenTelemetrySpanAdapter) {
            return context.with(trace.setSpan(context.active(), span.span), handler)
        }

        return handler()
    }
}

export class ApplicationTracing {
    constructor(private driver: TracingDriver = new NoopTracingDriver()) {}

    setDriver(driver: TracingDriver) {
        this.driver = driver
    }

    traceAsync<T>(name: string, attributes: TracingAttributes | undefined, handler: () => Promise<T>): Promise<T> {
        if (!this.driver.enabled()) {
            return handler()
        }

        const span = this.driver.startSpan(name, normalizeTracingAttributes(attributes))
        return this.driver.withSpan(span, async () => {
            try {
                return await handler()
            } catch (err) {
                span.recordException(err)
                span.setError()
                throw err
            } finally {
                span.end()
            }
        })
    }

    traceObservable<T>(source: Observable<T>, name: string, attributes?: TracingAttributes): Observable<T> {
        if (!this.driver.enabled()) {
            return source
        }

        return new Observable<T>((subscriber) => {
            const span = this.driver.startSpan(name, normalizeTracingAttributes(attributes))
            let ended = false
            const endSpan = () => {
                if (ended) {
                    return
                }
                ended = true
                span.end()
            }

            return this.driver.withSpan(span, () => {
                const subscription = source.subscribe({
                    next: (value) => {
                        subscriber.next(value)
                    },
                    error: (err) => {
                        span.recordException(err)
                        span.setError()
                        endSpan()
                        subscriber.error(err)
                    },
                    complete: () => {
                        endSpan()
                        subscriber.complete()
                    }
                })

                return () => {
                    subscription.unsubscribe()
                    endSpan()
                }
            })
        })
    }
}

export const applicationTracing = new ApplicationTracing()

let tracerProvider: NodeTracerProvider | null = null

export function initializeApplicationTracingFromEnv(): NodeTracerProvider | null {
    if (tracerProvider) {
        return tracerProvider
    }
    if (!isOpenTelemetryTracingEnabled()) {
        return null
    }

    const tracesEndpoint =
        readNonEmptyEnv('OTEL_EXPORTER_OTLP_TRACES_ENDPOINT') ?? readNonEmptyEnv('OTEL_EXPORTER_OTLP_ENDPOINT')
    if (!tracesEndpoint) {
        return null
    }

    tracerProvider = new NodeTracerProvider({
        resource: resourceFromAttributes({
            'service.name': readNonEmptyEnv('OTEL_SERVICE_NAME') ?? readNonEmptyEnv('SERVICE_NAME') ?? 'xpert-api'
        }),
        sampler: new ParentBasedSampler({
            root: new TraceIdRatioBasedSampler(readSamplerRatio())
        }),
        spanProcessors: [
            new BatchSpanProcessor(
                new OTLPTraceExporter({
                    url: tracesEndpoint,
                    headers: parseOpenTelemetryHeaders(process.env.OTEL_EXPORTER_OTLP_HEADERS)
                }),
                {
                    maxQueueSize: readIntegerEnv('OTEL_BSP_MAX_QUEUE_SIZE') ?? 512,
                    maxExportBatchSize: readIntegerEnv('OTEL_BSP_MAX_EXPORT_BATCH_SIZE') ?? 64,
                    scheduledDelayMillis: readIntegerEnv('OTEL_BSP_SCHEDULE_DELAY') ?? 5000,
                    exportTimeoutMillis: readIntegerEnv('OTEL_BSP_EXPORT_TIMEOUT') ?? 3000
                }
            )
        ]
    })
    tracerProvider.register()
    applicationTracing.setDriver(new OpenTelemetryTracingDriver())
    return tracerProvider
}

export async function shutdownApplicationTracing() {
    if (!tracerProvider) {
        return
    }

    const provider = tracerProvider
    tracerProvider = null
    applicationTracing.setDriver(new NoopTracingDriver())
    await provider.shutdown()
}

function normalizeTracingAttributes(attributes?: TracingAttributes): Record<string, TracingAttributeValue> {
    if (!attributes) {
        return {}
    }

    const normalized: Record<string, TracingAttributeValue> = {}
    for (const [key, value] of Object.entries(attributes)) {
        if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
            normalized[key] = value
        }
    }
    return normalized
}

function isOpenTelemetryTracingEnabled() {
    return ['1', 'true', 'yes'].includes((process.env.OTEL_TRACES_ENABLED ?? '').toLowerCase())
}

function readSamplerRatio() {
    const value = Number(process.env.OTEL_TRACES_SAMPLER_ARG)
    if (!Number.isFinite(value)) {
        return 0.01
    }
    return Math.min(Math.max(value, 0), 1)
}

function readNonEmptyEnv(name: string) {
    const value = process.env[name]?.trim()
    return value ? value : null
}

function readIntegerEnv(name: string) {
    const value = Number(process.env[name])
    if (!Number.isInteger(value) || value <= 0) {
        return null
    }
    return value
}

function parseOpenTelemetryHeaders(value: string | undefined): Record<string, string> {
    if (!value) {
        return {}
    }

    const headers: Record<string, string> = {}
    for (const item of value.split(',')) {
        const separatorIndex = item.indexOf('=')
        if (separatorIndex <= 0) {
            continue
        }

        const key = item.slice(0, separatorIndex).trim()
        const headerValue = item.slice(separatorIndex + 1).trim()
        if (key && headerValue) {
            headers[key] = headerValue
        }
    }
    return headers
}
