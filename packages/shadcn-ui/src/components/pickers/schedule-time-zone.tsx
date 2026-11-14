/// <reference lib="es2022.intl" />
import { useId, useMemo, useState } from 'react'
import { ChevronDown, Globe } from 'lucide-react'
import { Button } from '../ui/button'
import { Label } from '../ui/label'
import { Command, CommandEmpty, CommandInput, CommandItem, CommandList } from '../ui/command'
import { Popover, PopoverContent, PopoverTrigger } from '../ui/popover'
import { pickerText } from './picker-text'
import chineseCityNames from './time-zone-cities.zh.json'

const cities: Readonly<Record<string, string>> = chineseCityNames

const normalize = (text: string) => text.toLowerCase().replace(/_/g, ' ').trim()

function resolveZone(query: string) {
    if (!query.trim()) return
    try {
        return new Intl.DateTimeFormat('en', { timeZone: query.trim() }).resolvedOptions().timeZone
    } catch {
        return undefined
    }
}

export function TimeZonePicker({ value, locale, onChange, disabled }: {
    value: string; locale: string; onChange: (zone: string) => void; disabled?: boolean
}) {
    const t = pickerText(locale), id = useId()
    const [open, setOpen] = useState(false), [query, setQuery] = useState('')
    const options = useMemo(() => {
        // Existing records can use accepted IANA aliases outside supportedValuesOf's primary names.
        const available = new Set([value, 'UTC', ...Intl.supportedValuesOf('timeZone')])
        const alias = resolveZone(query)
        if (alias) available.add(alias)
        const search = normalize(query)
        return [...available].filter((zone) => zone === alias || normalize(zone).includes(search)
            || (t.locale === 'zh-Hans' && cities[zone]?.includes(search)))
    }, [value, query, t.locale])
    return <div className="min-w-0 space-y-1.5">
        <Label htmlFor={id} id={id + '-label'}>{t.timeZone}</Label>
        <Popover open={open} onOpenChange={(next) => { setOpen(next); setQuery('') }}>
            <PopoverTrigger asChild>
                <Button type="button" id={id} variant="outline" disabled={disabled}
                    aria-labelledby={id + '-label ' + id + '-value'}
                    className="w-full justify-start border-input font-normal">
                    <Globe aria-hidden="true" className="text-muted-foreground" />
                    <span id={id + '-value'} className="truncate">{value}</span>
                    <ChevronDown aria-hidden="true" className="ml-auto text-muted-foreground" />
                </Button>
            </PopoverTrigger>
            <PopoverContent align="start" aria-label={t.timeZone}
                className="w-[max(16rem,var(--radix-popover-trigger-width))] max-w-[calc(100vw-1rem)] p-0">
                <Command label={t.searchTimeZone} shouldFilter={false} loop>
                    <CommandInput placeholder={t.searchTimeZone} value={query} onValueChange={setQuery} />
                    <CommandList className="max-h-56">
                        <CommandEmpty>{t.noResults}</CommandEmpty>
                        {options.map((zone) => <CommandItem key={zone} value={zone} data-checked={zone === value}
                            onSelect={() => { onChange(zone); setOpen(false) }}>
                            <span className="min-w-0 break-all">{zone}</span>
                            {t.locale === 'zh-Hans' && cities[zone] && <span className="shrink-0 text-xs text-muted-foreground">{cities[zone]}</span>}
                        </CommandItem>)}
                    </CommandList>
                </Command>
            </PopoverContent>
        </Popover>
    </div>
}
