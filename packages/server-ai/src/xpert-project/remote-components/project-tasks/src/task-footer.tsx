import { ArrowRight } from 'lucide-react'
import type { Texts } from './i18n'

/** Keep counts and timeline legend in one row, including in narrow host panels. */
export function TaskFooter({
    visible,
    total,
    completed,
    legend,
    t
}: {
    visible: number
    total: number
    completed: number
    legend: boolean
    t: Texts
}) {
    return (
        <footer className="flex shrink-0 items-center gap-3 overflow-x-auto border-t px-3 py-1.5 text-xs whitespace-nowrap text-muted-foreground [&>*]:shrink-0">
            <span>
                {t.showing} {visible} / {total} {t.count}
            </span>
            {legend && (
                <div aria-label={t.legend} className="ml-auto flex items-center gap-3">
                    <span className="flex items-center gap-2">
                        <i className="h-3 w-5 rounded border border-dashed bg-muted" />
                        {t.planned}
                    </span>
                    <span className="flex items-center gap-2">
                        <i className="h-3 w-5 rounded bg-primary" />
                        {t.actual}
                    </span>
                    <span className="flex items-center gap-2">
                        <i className="w-5 border-t-2 border-dashed border-primary/50" />
                        {t.forecast}
                    </span>
                    <span className="flex items-center gap-2">
                        <ArrowRight className="size-4" />
                        {t.dependencies}
                    </span>
                    <span className="flex items-center gap-2">
                        <i className="w-5 border-t-2 border-dashed border-destructive" />
                        {t.critical}
                    </span>
                </div>
            )}
            <span className={legend ? 'tabular-nums' : 'ml-auto tabular-nums'}>
                {t.progress} {completed}
            </span>
        </footer>
    )
}
