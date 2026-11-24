import { useEffect, useRef, useState } from 'react'
import { ChevronsUpDown } from 'lucide-react'
import {
    buttonVariants,
    Command,
    CommandInput,
    CommandItem,
    CommandList,
    Popover,
    PopoverContent,
    PopoverTrigger
} from '@xpert-ai/shadcn-ui'
import { dateTime } from '../i18n'
import { listPipelines, type PipelineSummary } from './bridge'
import { pipelineTexts } from './i18n'

interface SelectionProps {
    instanceId: string | null
    locale: string
    onSelect: (item: PipelineSummary) => void
}

function InstanceOptions({ items, instanceId, locale, onSelect }: SelectionProps & { items: PipelineSummary[] }) {
    return items.map((item) => (
        <CommandItem
            key={item.id}
            value={item.id}
            data-checked={instanceId === item.id}
            onSelect={() => onSelect(item)}
        >
            <span className="min-w-0 flex-1 truncate" title={item.title}>
                {item.title}
            </span>
            <time
                dateTime={item.updatedAt}
                className="text-xs text-muted-foreground"
                title={pipelineTexts(locale).updated}
            >
                {dateTime(item.updatedAt, locale)}
            </time>
        </CommandItem>
    ))
}

// Mounted per search term so late pages cannot replace a newer search.
function InstanceSearch({ query, ...props }: SelectionProps & { query: string }) {
    const [page, setPage] = useState<Awaited<ReturnType<typeof listPipelines>>>({ items: [], next: null })
    const [after, setAfter] = useState<string>()
    const [busy, setBusy] = useState(true)
    const [error, setError] = useState('')
    const [retry, setRetry] = useState(0)
    const t = pipelineTexts(props.locale)
    useEffect(() => {
        let active = true
        setBusy(true)
        setError('')
        const timer = setTimeout(
            async () => {
                try {
                    const result = await listPipelines(after, query)
                    if (active)
                        setPage((previous) => ({
                            items: after ? [...previous.items, ...result.items] : result.items,
                            next: result.next
                        }))
                } catch (err) {
                    if (active) setError(err instanceof Error ? err.message : String(err))
                } finally {
                    if (active) setBusy(false)
                }
            },
            !query || after || retry ? 0 : 200
        )
        return () => {
            active = false
            clearTimeout(timer)
        }
    }, [query, after, retry])
    return (
        <>
            <InstanceOptions {...props} items={page.items} />
            {busy && (
                <p role="status" className="p-2 text-sm text-muted-foreground">
                    {t.loading}
                </p>
            )}
            {error && (
                <>
                    <p role="alert" className="p-2 text-sm text-destructive">
                        {error}
                    </p>
                    <CommandItem onSelect={() => setRetry((count) => count + 1)}>{t.retrySearch}</CommandItem>
                </>
            )}
            {!busy && !error && page.next && (
                <CommandItem onSelect={() => setAfter(page.next ?? undefined)}>{t.more}</CommandItem>
            )}
            {!busy && !error && !page.items.length && (
                <p role="status" className="p-2 text-sm text-muted-foreground">
                    {t.noInstances}
                </p>
            )}
        </>
    )
}

export interface InstanceCatalog {
    items: PipelineSummary[]
    hasMore: boolean
    busy: boolean
    onMore: () => void
}

export function PipelineInstanceSelect({
    instanceId,
    locale,
    onSelect,
    currentTitle,
    label,
    catalog,
    onClear,
    className
}: SelectionProps & {
    currentTitle?: string
    label: string
    catalog?: InstanceCatalog
    onClear?: () => void
    className: string
}) {
    const [open, setOpen] = useState(false)
    const trigger = useRef<HTMLButtonElement>(null)
    const restoreFocus = useRef(false)
    const [search, setSearch] = useState('')
    const query = search.trim()
    const t = pipelineTexts(locale)
    const toggle = (open: boolean) => {
        setOpen(open)
        if (!open) setSearch('')
    }
    const select = (item: PipelineSummary) => {
        restoreFocus.current = true
        onSelect(item)
        toggle(false)
    }
    return (
        <Popover open={open} onOpenChange={toggle}>
            <PopoverTrigger
                ref={trigger}
                role="combobox"
                aria-label={label}
                aria-expanded={open}
                title={currentTitle}
                className={buttonVariants({
                    variant: 'outline',
                    className: `min-w-0 justify-between font-normal ${className}`
                })}
            >
                <span className="truncate">{currentTitle || label}</span>
                <ChevronsUpDown aria-hidden />
            </PopoverTrigger>
            <PopoverContent
                align="start"
                className="w-80 max-w-[calc(100vw_-_1.5rem)] p-0"
                onEscapeKeyDown={() => {
                    restoreFocus.current = true
                }}
                onKeyDownCapture={(event) => {
                    if (event.key !== 'Escape') return
                    event.preventDefault()
                    event.stopPropagation()
                    restoreFocus.current = true
                    toggle(false)
                }}
                onCloseAutoFocus={(event) => {
                    if (!restoreFocus.current) return
                    restoreFocus.current = false
                    event.preventDefault()
                    trigger.current?.focus()
                }}
            >
                <Command shouldFilter={false}>
                    <CommandInput
                        value={search}
                        onValueChange={setSearch}
                        placeholder={t.searchInstances}
                        aria-label={t.searchInstances}
                        maxLength={200}
                    />
                    <CommandList aria-label={label}>
                        {onClear && !query && (
                            <CommandItem
                                value="__all"
                                data-checked={!instanceId}
                                onSelect={() => {
                                    restoreFocus.current = true
                                    onClear()
                                    toggle(false)
                                }}
                            >
                                {t.allInstances}
                            </CommandItem>
                        )}
                        {query || !catalog ? (
                            <InstanceSearch
                                key={query}
                                query={query}
                                instanceId={instanceId}
                                locale={locale}
                                onSelect={select}
                            />
                        ) : (
                            <>
                                <InstanceOptions
                                    items={catalog.items}
                                    instanceId={instanceId}
                                    locale={locale}
                                    onSelect={select}
                                />
                                {catalog.hasMore && (
                                    <CommandItem disabled={catalog.busy} onSelect={catalog.onMore}>
                                        {t.more}
                                    </CommandItem>
                                )}
                            </>
                        )}
                    </CommandList>
                </Command>
            </PopoverContent>
        </Popover>
    )
}
