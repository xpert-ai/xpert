import React, { useCallback, useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react'
import { ChevronsUpDown, Loader2 } from 'lucide-react'
import {
    Button,
    Command,
    CommandInput,
    CommandItem,
    CommandList,
    Popover,
    PopoverContent,
    PopoverTrigger
} from '@xpert-ai/shadcn-ui'
import type { MapOptionsPage } from '../../../schema'
import type { Labels } from './i18n'
import type { OptionCache } from './option-cache'

type Choice = MapOptionsPage['options'][number]

/** Server search pages and scroll position survive popover and view switches in the host-scoped cache. */
export function SearchSelect({
    label,
    placeholder,
    value,
    selectedLabel,
    scopeKey,
    cache,
    load,
    onChange,
    fixedChoices = [],
    labels: l,
    className
}: {
    label: string
    placeholder: string
    value: string
    selectedLabel: string
    scopeKey: string
    cache: OptionCache
    load: (search: string, offset: number) => Promise<MapOptionsPage>
    onChange: (value: string) => void
    fixedChoices?: Choice[]
    labels: Labels
    className?: string
}) {
    const [open, setOpen] = useState(false),
        [search, setSearch] = useState('')
    const [chosen, setChosen] = useState<Choice>()
    const [list, setList] = useState<HTMLElement | null>(null)
    const mountList = useCallback((element: HTMLDivElement | null) => {
        setList(element?.querySelector<HTMLElement>('[cmdk-list]') ?? null)
    }, [])
    const query = search.trim()
    const page = useSyncExternalStore(cache.subscribe, () => cache.read(scopeKey, query))
    const busy = page.loading || (!page.loaded && !page.error)
    const loader = useRef(load)
    loader.current = load
    useEffect(() => {
        if (!open || page.loaded || page.loading || page.error) return
        const timer = setTimeout(() => void cache.load(scopeKey, query, loader.current), query ? 250 : 0)
        return () => clearTimeout(timer)
    }, [open, query, scopeKey, cache, page.loaded, page.loading, page.error])
    useLayoutEffect(() => {
        if (list) list.scrollTop = cache.scrollTop(scopeKey, query)
    }, [list, scopeKey, query, cache])
    const loadNearBottom = useCallback(
        (element: HTMLElement) => {
            if (
                page.loaded &&
                !page.loading &&
                !page.error &&
                page.nextOffset !== null &&
                element.scrollHeight - element.scrollTop - element.clientHeight <= 40
            ) {
                void cache.load(scopeKey, query, loader.current, true)
            }
        },
        [cache, scopeKey, query, page]
    )
    useEffect(() => {
        // Also fill short lists whose first page does not create a scrollbar.
        if (open && list) loadNearBottom(list)
    }, [open, list, loadNearBottom])
    const choices = [
        ...fixedChoices.filter((item) => item.label.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase())),
        ...page.options
    ]
    const title =
        choices.find((item) => item.value === value)?.label ?? (chosen?.value === value ? chosen.label : selectedLabel)
    return (
        <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
                <Button
                    variant="outline"
                    role="combobox"
                    aria-label={label}
                    aria-expanded={open}
                    title={title}
                    className={`min-w-0 justify-between font-normal ${className ?? ''}`}
                >
                    <span className="truncate">{title || label}</span>
                    <ChevronsUpDown aria-hidden className="size-4 shrink-0 text-muted-foreground" />
                </Button>
            </PopoverTrigger>
            <PopoverContent align="start" collisionPadding={12} className="w-80 max-w-[calc(100vw_-_1.5rem)] p-0">
                <Command shouldFilter={false}>
                    <CommandInput
                        aria-label={placeholder}
                        placeholder={placeholder}
                        value={search}
                        maxLength={200}
                        onValueChange={setSearch}
                    />
                    <div ref={mountList}>
                        <CommandList
                            aria-label={label}
                            aria-busy={busy}
                            onScroll={(event) => {
                                cache.saveScroll(scopeKey, query, event.currentTarget.scrollTop)
                                loadNearBottom(event.currentTarget)
                            }}
                        >
                            {choices.map((item) => (
                                <CommandItem
                                    key={item.value}
                                    value={item.value}
                                    data-checked={value === item.value}
                                    onSelect={() => {
                                        setChosen(item)
                                        onChange(item.value)
                                        setOpen(false)
                                        setSearch('')
                                    }}
                                >
                                    <span className="min-w-0 flex-1 truncate" title={item.label}>
                                        {item.label}
                                    </span>
                                </CommandItem>
                            ))}
                            {!busy && !page.error && !choices.length && (
                                <p role="status" className="px-3 py-6 text-center text-sm text-muted-foreground">
                                    {l.noOptions}
                                </p>
                            )}
                        </CommandList>
                    </div>
                </Command>
                {(busy || page.error) && (
                    <div className="border-t p-2">
                        {busy ? (
                            <p
                                role="status"
                                className="flex items-center justify-center gap-2 py-1 text-xs text-muted-foreground"
                            >
                                <Loader2 aria-hidden className="size-3.5 animate-spin" />
                                {l.loading}
                            </p>
                        ) : (
                            <div className="space-y-1">
                                <p role="alert" className="px-2 text-xs text-destructive">
                                    {page.error}
                                </p>
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    className="w-full"
                                    onClick={() => void cache.load(scopeKey, query, loader.current, true)}
                                >
                                    {l.retry}
                                </Button>
                            </div>
                        )}
                    </div>
                )}
            </PopoverContent>
        </Popover>
    )
}
