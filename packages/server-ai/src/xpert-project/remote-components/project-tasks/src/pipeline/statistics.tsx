import { useState } from 'react'
import { BarChart3, X } from 'lucide-react'
import { Button, Dialog, DialogContent, DialogTitle, DialogDescription } from '@xpert-ai/shadcn-ui'
import type { PipelineGraph } from './bridge'
import type { PipelineTexts } from './i18n'
import { executionProviderLabel } from '../execution-provider'
import { PipelineModelUsage } from './model-usage'
import { PipelineModelBudget } from './model-budget'

export function PipelineStatistics({ graph, locale, t }: { graph: PipelineGraph; locale: string; t: PipelineTexts }) {
    const [open, setOpen] = useState(false)
    const stats = graph.statistics
    if (!stats) return null
    const business = stats.business ?? stats.work
    const number = new Intl.NumberFormat(locale, { maximumFractionDigits: 1 })
    const duration = (ms: number | null | undefined) =>
        ms == null
            ? t.unavailableMetric
            : new Intl.NumberFormat(locale, {
                  style: 'unit',
                  unit: 'second',
                  unitDisplay: 'short',
                  maximumFractionDigits: 1
              }).format(ms / 1000)
    const rate = (value: number | null) => (value === null ? t.unavailableMetric : `${number.format(value * 100)}%`)
    return (
        <>
            <Button variant="ghost" size="sm" onClick={() => setOpen(true)}>
                <BarChart3 />
                {t.statistics}
            </Button>
            <Dialog open={open} onOpenChange={setOpen}>
                <DialogContent
                    className="flex max-h-[85dvh] flex-col gap-0 overflow-hidden p-0 sm:max-w-2xl"
                    showCloseButton={false}
                >
                    <div className="flex shrink-0 items-center justify-between border-b px-4 py-3">
                        <DialogTitle>
                            {t.statistics} · {t.round} {graph.round.sequence}
                        </DialogTitle>
                        <Button variant="ghost" size="icon" aria-label={t.close} onClick={() => setOpen(false)}>
                            <X />
                        </Button>
                    </div>
                    <div className="min-h-0 overflow-y-auto p-4">
                        <DialogDescription>{t.statisticsScope}</DialogDescription>
                        {stats.executionScope === 'linked_task_history' && (
                            <p className="mt-2 text-xs text-muted-foreground">{t.executionHistoryScope}</p>
                        )}
                        <dl className="my-5 grid grid-cols-2 gap-4 text-sm sm:grid-cols-3">
                            {[
                                [t.businessCompletion, `${business.completed} / ${business.total}`],
                                [
                                    t.runtimeSuccess,
                                    `${rate(stats.attempts.successRate)} (${stats.attempts.succeeded} / ${stats.attempts.terminal})`
                                ],
                                [t.attempts, stats.attempts.total],
                                [t.timingCoverage, `${stats.timing?.samples ?? 0} / ${stats.attempts.total}`],
                                [t.durationTotal, duration(stats.timing?.totalMs)],
                                [t.durationP95, duration(stats.timing?.p95Ms)]
                            ].map(([label, value]) => (
                                <div key={label}>
                                    <dt className="text-xs text-muted-foreground">{label}</dt>
                                    <dd className="mt-1 font-medium tabular-nums">{value}</dd>
                                </div>
                            ))}
                        </dl>
                        <p className="text-xs text-muted-foreground">{t.durationHint}</p>
                        {stats.attempts.additionalAttempts !== undefined && (
                            <>
                                <dl className="my-4 grid grid-cols-2 gap-4 text-sm sm:grid-cols-3">
                                    {[
                                        [t.additionalAttempts, stats.attempts.additionalAttempts],
                                        [t.confirmedRetries, stats.attempts.retries],
                                        [
                                            t.unclassifiedAttempts,
                                            stats.attempts.unclassifiedAttempts ?? t.unavailableMetric
                                        ]
                                    ].map(([label, value]) => (
                                        <div key={label}>
                                            <dt className="text-xs text-muted-foreground">{label}</dt>
                                            <dd className="mt-1 font-medium tabular-nums">{value}</dd>
                                        </div>
                                    ))}
                                </dl>
                                <p className="text-xs text-muted-foreground">{t.retryCountsHint}</p>
                            </>
                        )}
                        <h3 className="mb-2 mt-6 text-sm font-medium">{t.actualExecutors}</h3>
                        <div className="overflow-x-auto">
                            <table className="w-full text-left text-sm">
                                <thead className="border-b text-xs text-muted-foreground">
                                    <tr>
                                        <th className="py-2 font-medium">{t.actualExecutors}</th>
                                        <th className="p-2 font-medium">{t.runtimeSuccess}</th>
                                        <th className="py-2 text-right font-medium">{t.duration}</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {stats.byExecutor?.map((group, index) => {
                                        const task = group.xpertId
                                            ? graph.tasks.tasks.find((task) => task.assigneeXpertId === group.xpertId)
                                            : null
                                        const serviceAttempt = group.serviceRef
                                            ? graph.tasks.executions.find(
                                                  (attempt) => attempt.runtimeServiceRef === group.serviceRef
                                              )
                                            : null
                                        const serviceTask =
                                            serviceAttempt &&
                                            graph.tasks.tasks.find((task) => task.id === serviceAttempt.taskId)
                                        const name =
                                            task?.assigneeName ??
                                            group.agentKey ??
                                            serviceTask?.title ??
                                            t.executorUnknown
                                        const provider =
                                            group.provider === 'pipeline-service'
                                                ? t.serviceExecutor
                                                : (executionProviderLabel({
                                                      runtimeProvider: group.provider ?? undefined,
                                                      runtimeToolId: group.toolId ?? undefined
                                                  }) ?? t.providerUnknown)
                                        return (
                                            <tr key={index} className="border-b last:border-0">
                                                <td className="max-w-64 py-3 pr-2">
                                                    <p className="truncate" title={name}>
                                                        {name}
                                                    </p>
                                                    <p className="text-xs text-muted-foreground">{provider}</p>
                                                </td>
                                                <td className="p-2 tabular-nums">
                                                    {rate(group.attempts.successRate)}
                                                    <p className="text-xs text-muted-foreground">
                                                        {group.attempts.total} {t.attempts}
                                                    </p>
                                                </td>
                                                <td className="py-3 text-right tabular-nums">
                                                    {duration(group.timing.meanMs)}
                                                    <p className="text-xs text-muted-foreground">
                                                        {group.timing.samples} / {group.attempts.total}
                                                    </p>
                                                </td>
                                            </tr>
                                        )
                                    })}
                                </tbody>
                            </table>
                        </div>
                        {!stats.byExecutor?.length && (
                            <p className="py-4 text-sm text-muted-foreground">{t.noAttempts}</p>
                        )}
                        <PipelineModelUsage usage={stats.modelUsage} locale={locale} t={t} />
                        <PipelineModelBudget budget={stats.nativeModelBudget} locale={locale} t={t} />
                    </div>
                </DialogContent>
            </Dialog>
        </>
    )
}
