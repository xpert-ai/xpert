import type { PipelineGraph } from './bridge'
import type { PipelineTexts } from './i18n'

export function PipelineModelUsage({
    usage,
    locale,
    t
}: {
    usage: NonNullable<PipelineGraph['statistics']>['modelUsage']
    locale: string
    t: PipelineTexts
}) {
    if (!usage) return null
    const number = new Intl.NumberFormat(locale, { maximumFractionDigits: 7 })
    const metric = (value: number | null) => (value === null ? t.unavailableMetric : number.format(value))
    return (
        <section className="mt-6 border-t pt-4 text-sm">
            <h3 className="font-medium">{t.modelUsage}</h3>
            <p className="mt-2 text-xs text-muted-foreground">{t.modelUsageHint}</p>
            <p className="mt-2 text-xs text-muted-foreground">
                {t.modelUsageCoverage}: {usage.executionsWithRecords} / {usage.requestedExecutions}
            </p>
            {(usage.truncated || usage.rejectedRecords > 0) && (
                <p className="mt-2 text-xs text-destructive">{t.modelUsageIncomplete}</p>
            )}
            {!usage.calls ? (
                <p className="py-4 text-muted-foreground">{t.noLinkedModelUsage}</p>
            ) : (
                <>
                    <dl className="my-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
                        {[
                            [t.modelCalls, usage.calls],
                            [t.inputTokens, usage.inputTokens],
                            [t.outputTokens, usage.outputTokens],
                            [t.totalTokens, usage.totalTokens]
                        ].map(([label, value]) => (
                            <div key={label}>
                                <dt className="text-xs text-muted-foreground">{label}</dt>
                                <dd className="mt-1 tabular-nums">
                                    {metric(typeof value === 'number' ? value : null)}
                                </dd>
                            </div>
                        ))}
                    </dl>
                    <div className="overflow-x-auto">
                        <table className="w-full text-left text-xs">
                            <thead className="border-b text-muted-foreground">
                                <tr>
                                    <th className="py-2 font-medium">{t.model}</th>
                                    <th className="p-2 text-right font-medium">{t.modelCalls}</th>
                                    <th className="py-2 text-right font-medium">{t.totalTokens}</th>
                                </tr>
                            </thead>
                            <tbody>
                                {usage.byModel.map((group) => (
                                    <tr
                                        key={JSON.stringify([group.provider, group.model])}
                                        className="border-b last:border-0"
                                    >
                                        <td className="py-2">
                                            {group.model}
                                            <p className="text-muted-foreground">{group.provider}</p>
                                        </td>
                                        <td className="p-2 text-right tabular-nums">{group.calls}</td>
                                        <td className="py-2 text-right tabular-nums">{metric(group.totalTokens)}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                    <dl className="mt-4 flex flex-wrap gap-6">
                        <div>
                            <dt className="text-xs text-muted-foreground">{t.recordedCost}</dt>
                            <dd className="mt-1 tabular-nums">
                                {usage.costs.length
                                    ? usage.costs
                                          .map((cost) => `${number.format(cost.amount)} ${cost.currency}`)
                                          .join(' · ')
                                    : t.unavailableMetric}
                            </dd>
                        </div>
                        <div>
                            <dt className="text-xs text-muted-foreground">{t.unpricedCalls}</dt>
                            <dd className="mt-1 tabular-nums">{usage.unpricedCalls}</dd>
                        </div>
                    </dl>
                </>
            )}
        </section>
    )
}
