import type { PipelineQueueStatistics } from '@xpert-ai/contracts'
import type { PipelineTexts } from './i18n'

export function PipelineQueueMetrics({
    data,
    locale,
    t
}: {
    data?: PipelineQueueStatistics
    locale: string
    t: PipelineTexts
}) {
    if (!data) return null
    const duration = (value: number | null) =>
        value === null
            ? t.unavailableMetric
            : new Intl.NumberFormat(locale, { style: 'unit', unit: 'second', maximumFractionDigits: 1 }).format(
                  value / 1000
              )
    return (
        <section className="mt-6 border-t pt-4">
            <h3 className="text-sm font-medium">{t.queueStatistics}</h3>
            <p className="mt-1 text-xs text-muted-foreground">{t.queueStatisticsScope}</p>
            <dl className="my-4 grid grid-cols-2 gap-4 text-sm sm:grid-cols-3">
                {[
                    [t.queueRecorded, data.total.total],
                    [t.queueDispatched, data.total.dispatched],
                    [t.queuePending, data.total.queued],
                    [t.queueMean, duration(data.total.dispatchWait.meanMs)],
                    [t.queueP95, duration(data.total.dispatchWait.p95Ms)],
                    [t.queueOldest, duration(data.total.pendingWait.oldestMs)]
                ].map(([label, value]) => (
                    <div key={label}>
                        <dt className="text-xs text-muted-foreground">{label}</dt>
                        <dd className="mt-1 font-medium tabular-nums">{value}</dd>
                    </div>
                ))}
            </dl>
            <p className="text-xs text-muted-foreground">
                {t.queueUnavailable}: {data.total.unavailable} · {t.queueUndated}: {data.coverage.missingCreatedAt}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
                {data.bySource
                    .map(
                        (group) =>
                            `${group.source === 'managed_operation' ? t.queueManaged : t.queueProvider}: ${group.metrics.total}`
                    )
                    .join(' · ')}
            </p>
        </section>
    )
}
