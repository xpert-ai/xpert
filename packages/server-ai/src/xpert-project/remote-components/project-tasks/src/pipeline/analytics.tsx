import { useEffect, useState } from 'react'
import { ChartNoAxesCombined } from 'lucide-react'
import {
    Button,
    Dialog,
    DialogTrigger,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue
} from '@xpert-ai/shadcn-ui'
import type { ProjectPipelineAnalytics } from '@xpert-ai/contracts'
import { dateTime } from '../i18n'
import { readPipelineAnalytics } from './bridge'
import type { PipelineTexts } from './i18n'
import { PipelineModelUsage } from './model-usage'
import { PipelineQueueMetrics } from './queue-statistics'
import { PipelineHumanWaitMetrics } from './human-wait-statistics'

export function PipelineAnalytics({ locale, t }: { locale: string; t: PipelineTexts }) {
    const [open, setOpen] = useState(false),
        [days, setDays] = useState('1'),
        [refresh, setRefresh] = useState(0)
    const [data, setData] = useState<ProjectPipelineAnalytics | null>(null),
        [error, setError] = useState(false)
    useEffect(() => {
        if (!open) return
        let current = true
        const to = new Date(),
            from = new Date(to.getTime() - Number(days) * 86400_000)
        setData(null)
        setError(false)
        void readPipelineAnalytics({ from: from.toISOString(), to: to.toISOString() })
            .then((result) => {
                if (current) setData(result)
            })
            .catch(() => {
                if (current) setError(true)
            })
        return () => {
            current = false
        }
    }, [open, days, refresh])
    const number = new Intl.NumberFormat(locale, { maximumFractionDigits: 1 })
    const rate = (value: number | null) => (value === null ? t.unavailableMetric : `${number.format(value * 100)}%`)
    const duration = (value: number | null) =>
        value === null
            ? t.unavailableMetric
            : new Intl.NumberFormat(locale, { style: 'unit', unit: 'second', maximumFractionDigits: 1 }).format(
                  value / 1000
              )
    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
                <Button variant="ghost" size="sm" onClick={() => setOpen(true)}>
                    <ChartNoAxesCombined />
                    {t.projectAnalytics}
                </Button>
            </DialogTrigger>
            <DialogContent className="flex max-h-[85dvh] flex-col overflow-hidden sm:max-w-3xl">
                <DialogHeader>
                    <DialogTitle>{t.projectAnalytics}</DialogTitle>
                    <DialogDescription>{t.projectAnalyticsScope}</DialogDescription>
                </DialogHeader>
                <div className="min-h-0 overflow-y-auto">
                    <div className="my-4 flex items-center gap-2">
                        <Select value={days} onValueChange={setDays}>
                            <SelectTrigger className="w-48" aria-label={t.analyticsWindow}>
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                {[
                                    ['1', t.latestDay],
                                    ['7', t.latestWeek],
                                    ['30', t.latestMonth]
                                ].map(([value, label]) => (
                                    <SelectItem key={value} value={value}>
                                        {label}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                        <Button variant="outline" size="sm" onClick={() => setRefresh((value) => value + 1)}>
                            {t.refresh}
                        </Button>
                    </div>
                    {error ? (
                        <p role="alert" className="text-sm text-destructive">
                            {t.actionFailed}
                        </p>
                    ) : !data ? (
                        <p role="status">{t.loading}</p>
                    ) : (
                        <>
                            <p className="text-xs text-muted-foreground">
                                {dateTime(data.window.from, locale)} → {dateTime(data.window.to, locale)}
                            </p>
                            <dl className="my-5 grid grid-cols-2 gap-4 text-sm sm:grid-cols-3">
                                {[
                                    [t.analyticsInstances, data.coverage.instances],
                                    [
                                        t.businessCompletion,
                                        `${data.current.business.completed} / ${data.current.business.total}`
                                    ],
                                    [t.needsYou, data.current.needsYou],
                                    [t.attempts, data.executions.attempts.total],
                                    [t.runtimeSuccess, rate(data.executions.attempts.successRate)],
                                    [t.durationP95, duration(data.executions.timing.p95Ms)]
                                ].map(([label, value]) => (
                                    <div key={label}>
                                        <dt className="text-xs text-muted-foreground">{label}</dt>
                                        <dd className="mt-1 font-medium tabular-nums">{value}</dd>
                                    </div>
                                ))}
                            </dl>
                            <p className="text-xs text-muted-foreground">
                                {t.analyticsUndated}: {data.coverage.attemptsWithoutStartTime} · {t.confirmedRetries}:{' '}
                                {data.executions.attempts.retries}
                            </p>
                            {(data.coverage.sharedAcrossInstances > 0 ||
                                data.coverage.instancesWithoutCurrentRound > 0) && (
                                <p className="mt-2 text-xs text-muted-foreground">
                                    {t.analyticsOverlap}: {data.coverage.sharedAcrossInstances} ·{' '}
                                    {t.analyticsIncomplete}: {data.coverage.instancesWithoutCurrentRound}
                                </p>
                            )}
                            <PipelineQueueMetrics data={data.queue} locale={locale} t={t} />
                            <PipelineHumanWaitMetrics data={data.humanWait} locale={locale} t={t} />
                            <h3 className="mb-2 mt-6 text-sm font-medium">{t.analyticsByInstance}</h3>
                            <div className="overflow-x-auto">
                                <table className="w-full text-left text-sm">
                                    <thead className="border-b text-xs text-muted-foreground">
                                        <tr>
                                            <th className="py-2 font-medium">{t.title}</th>
                                            <th className="p-2 font-medium">{t.businessCompletion}</th>
                                            <th className="p-2 font-medium">{t.attempts}</th>
                                            <th className="py-2 font-medium">{t.runtimeSuccess}</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {data.byInstance.map((instance) => (
                                            <tr key={instance.id} className="border-b last:border-0">
                                                <td className="max-w-80 py-3 pr-2">
                                                    <p className="truncate" title={instance.title}>
                                                        {instance.title}
                                                    </p>
                                                </td>
                                                <td className="p-2 tabular-nums">
                                                    {instance.current.business.completed} /{' '}
                                                    {instance.current.business.total}
                                                </td>
                                                <td className="p-2 tabular-nums">
                                                    {instance.executions.attempts.total}
                                                </td>
                                                <td className="py-3 tabular-nums">
                                                    {rate(instance.executions.attempts.successRate)}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                            {!data.byInstance.length && <p className="py-4 text-sm text-muted-foreground">{t.empty}</p>}
                            <p className="mt-4 text-xs text-muted-foreground">{t.analyticsUsageScope}</p>
                            <PipelineModelUsage usage={data.modelUsage} locale={locale} t={t} />
                        </>
                    )}
                </div>
            </DialogContent>
        </Dialog>
    )
}
