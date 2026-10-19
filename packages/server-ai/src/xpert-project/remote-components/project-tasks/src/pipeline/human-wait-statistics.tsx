import type { PipelineHumanWaitStatistics } from '@xpert-ai/contracts'
import type { PipelineTexts } from './i18n'

export function PipelineHumanWaitMetrics({
    data,
    locale,
    t
}: {
    data?: PipelineHumanWaitStatistics
    locale: string
    t: PipelineTexts
}) {
    if (!data) return null
    const duration = (value: number | null) => {
        if (value === null) return t.unavailableMetric
        const [unit, divisor] =
            value >= 3600000
                ? (['hour', 3600000] as const)
                : value >= 60000
                  ? (['minute', 60000] as const)
                  : (['second', 1000] as const)
        return new Intl.NumberFormat(locale, { style: 'unit', unit, maximumFractionDigits: 1 }).format(value / divisor)
    }
    return (
        <section className="mt-6 border-t pt-4">
            <h3 className="text-sm font-medium">{t.humanWaitStatistics}</h3>
            <p className="mt-1 text-xs text-muted-foreground">{t.humanWaitScope}</p>
            <dl className="my-4 grid grid-cols-2 gap-4 text-sm sm:grid-cols-3">
                {[
                    [t.humanWaitIntervals, data.intervals],
                    [t.humanWaitOngoing, data.ongoing],
                    [t.humanWaitCensored, data.censored],
                    [t.humanWaitTotal, duration(data.observedNodeMs)],
                    [t.humanWaitUnion, duration(data.observedUnionMs)]
                ].map(([label, value]) => (
                    <div key={label}>
                        <dt className="text-xs text-muted-foreground">{label}</dt>
                        <dd className="mt-1 font-medium tabular-nums">{value}</dd>
                    </div>
                ))}
            </dl>
            {(data.coverage.missingEvents > 0 ||
                data.coverage.invalidEvents > 0 ||
                data.coverage.currentUntrackedNodes > 0) && (
                <p className="text-xs text-muted-foreground">
                    {t.humanWaitIncomplete} {t.humanWaitUntracked}: {data.coverage.currentUntrackedNodes}
                </p>
            )}
        </section>
    )
}
