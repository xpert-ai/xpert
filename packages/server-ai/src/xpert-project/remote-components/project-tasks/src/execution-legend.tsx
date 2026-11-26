import { cn } from '@xpert-ai/shadcn-ui'
import { executionColors } from './execution-summary'
import type { Texts } from './i18n'

export function ExecutionLegend({ t }: { t: Texts }) {
    const items = [
        { color: executionColors.running, label: t.running },
        { color: executionColors.success, label: t.success },
        { color: executionColors.failed, label: t.failed },
        { color: executionColors.other, label: t.otherExecutionStatus }
    ]
    return (
        <div
            role="group"
            aria-label={t.executionLegend}
            title={t.executionLegend}
            className="ml-auto flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground"
        >
            <span>{t.agentExecutions}:</span>
            {items.map(({ color, label }) => (
                <span key={label} className="inline-flex items-center gap-1.5 whitespace-nowrap">
                    <span aria-hidden className={cn('size-2 shrink-0 rounded-full ring-2', color)} />
                    {label}
                </span>
            ))}
        </div>
    )
}
