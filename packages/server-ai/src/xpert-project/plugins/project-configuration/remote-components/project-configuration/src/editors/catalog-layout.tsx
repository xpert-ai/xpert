import { useId, type ReactNode } from 'react'
import { Search as SearchIcon } from 'lucide-react'
import { Button, Input } from '@xpert-ai/shadcn-ui'

export function SectionHeading({ title, count, children }: { title: string; count?: number; children?: ReactNode }) {
    return <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
            <h2 className="text-lg font-semibold">{title}</h2>
            {count !== undefined && <span className="rounded-full bg-muted px-2 text-xs font-medium tabular-nums text-muted-foreground">{count}</span>}
        </div>
        <div className="flex flex-wrap items-center gap-2">{children}</div>
    </header>
}

export function CatalogTrigger({ label, expanded, controls, onClick, icon, secondary = false }: {
    label: string; expanded: boolean; controls: string; onClick: () => void; icon: ReactNode; secondary?: boolean
}) {
    return <Button type="button" size="sm" variant={secondary ? 'outline' : 'default'}
        aria-expanded={expanded} aria-controls={controls} onClick={onClick}>{icon}{label}</Button>
}

export function CatalogPanel({ id, title, children }: { id: string; title: string; children: ReactNode }) {
    return <section id={id} aria-label={title} className="space-y-3 rounded-lg border bg-muted/20 p-3 sm:p-4">
        <h3 className="text-sm font-semibold">{title}</h3>
        {children}
    </section>
}

export function CatalogSearch({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
    const id = useId()
    return <div className="relative min-w-0 flex-1">
        <label htmlFor={id} className="sr-only">{label}</label>
        <SearchIcon aria-hidden="true" className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input id={id} type="search" className="bg-background ps-9" placeholder={label} maxLength={200}
            value={value} onChange={(event) => onChange(event.target.value)} />
    </div>
}

export function EmptyMessage({ children }: { children: ReactNode }) {
    return <p role="status" className="rounded-md border border-dashed px-4 py-4 text-sm text-muted-foreground">{children}</p>
}
