import { useEffect, useState } from 'react'
import { z } from 'zod'
import {
    Button,
    Command,
    CommandGroup,
    CommandInput,
    CommandItem,
    CommandList,
    Input,
    Label,
    Popover,
    PopoverContent,
    PopoverTrigger,
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue
} from '@xpert-ai/shadcn-ui'
import { request, type Destination } from './bridge'
import { texts } from './i18n'

const pageSchema = z.object({
    item: z.object({
        items: z.array(
            z.object({
                conversationId: z.string().uuid(),
                threadId: z.string().uuid(),
                title: z.string(),
                pinned: z.boolean(),
                updatedAt: z.string()
            })
        ),
        nextOffset: z.number().int().nullable()
    })
})
type ChatOption = z.infer<typeof pageSchema>['item']['items'][number]
const units = { minutes: 1, hours: 60, days: 1440, weeks: 10080 } as const
type Unit = keyof typeof units
type Props = {
    locale: string
    destination?: Destination
    currentThreadId?: string
    currentTitle?: string
    intervalMinutes: number
    disabled?: boolean
    onTarget: (value: Destination | undefined) => void
    onInterval: (minutes: number) => void
}
export function MonitorSettings({
    locale,
    currentTitle,
    currentThreadId,
    destination,
    intervalMinutes,
    disabled,
    onTarget,
    onInterval
}: Props) {
    const t = texts(locale)
    const [open, setOpen] = useState(false),
        [search, setSearch] = useState(''),
        [offset, setOffset] = useState(0)
    const [rows, setRows] = useState<ChatOption[]>([]),
        [next, setNext] = useState<number | null>(null),
        [loading, setLoading] = useState(false),
        [failed, setFailed] = useState(false)
    const [unit, setUnit] = useState<Unit>(() =>
        intervalMinutes % 10080 === 0
            ? 'weeks'
            : intervalMinutes % 1440 === 0
              ? 'days'
              : intervalMinutes % 60 === 0
                ? 'hours'
                : 'minutes'
    )
    useEffect(() => {
        if (!open) return
        let active = true
        setLoading(true)
        setFailed(false)
        const timer = window.setTimeout(
            async () => {
                try {
                    const { item } = pageSchema.parse(
                        await request('requestData', {
                            query: { search, cursor: String(offset), parameters: { listTargets: true } }
                        })
                    )
                    if (active) {
                        setRows((old) => (offset ? [...old, ...item.items] : item.items))
                        setNext(item.nextOffset)
                    }
                } catch {
                    if (active) setFailed(true)
                } finally {
                    if (active) setLoading(false)
                }
            },
            search ? 180 : 0
        )
        return () => {
            active = false
            window.clearTimeout(timer)
        }
    }, [open, search, offset])
    function choose(selected: Destination | undefined) {
        onTarget(selected)
        setOpen(false)
    }
    const selectedLabel =
        destination?.type === 'new_chat' ? t.newChat : destination?.title || currentTitle || t.currentChat
    const amount = intervalMinutes ? intervalMinutes / units[unit] : ''
    function results(pinned: boolean) {
        const matches = rows.filter((item) => item.pinned === pinned && (search || item.threadId !== currentThreadId))
        return (
            matches.length > 0 && (
                <CommandGroup heading={pinned ? t.pinnedChats : t.chats}>
                    {matches.map((item) => (
                        <CommandItem
                            key={item.conversationId}
                            value={item.conversationId}
                            onSelect={() =>
                                choose({
                                    type: 'conversation',
                                    conversationId: item.conversationId,
                                    threadId: item.threadId,
                                    title: item.title
                                })
                            }
                        >
                            <span className="min-w-0 flex-1 truncate">{item.title || t.untitled}</span>
                            <span className="text-xs text-muted-foreground">
                                {new Date(item.updatedAt).toLocaleDateString(locale)}
                            </span>
                        </CommandItem>
                    ))}
                </CommandGroup>
            )
        )
    }
    return (
        <div className="space-y-5">
            <div className="flex items-center justify-between gap-3 rounded-lg border border-border px-3 py-2">
                <Label htmlFor="monitor-target">{t.runIn}</Label>
                <Popover
                    open={open}
                    onOpenChange={(value) => {
                        setOpen(value)
                        if (value) {
                            setSearch('')
                            setOffset(0)
                            setRows([])
                            setNext(null)
                        }
                    }}
                >
                    <PopoverTrigger asChild>
                        <Button
                            id="monitor-target"
                            type="button"
                            variant="ghost"
                            disabled={disabled}
                            aria-label={t.runIn}
                            className="max-w-[75%]"
                        >
                            <span className="truncate">{selectedLabel}</span>
                            <span aria-hidden="true">⌄</span>
                        </Button>
                    </PopoverTrigger>
                    <PopoverContent align="end" className="w-[min(28rem,90vw)] p-0">
                        <Command shouldFilter={false}>
                            <CommandInput
                                placeholder={t.searchChats}
                                aria-label={t.searchChats}
                                value={search}
                                onValueChange={(text) => {
                                    setSearch(text)
                                    setOffset(0)
                                    setRows([])
                                    setNext(null)
                                }}
                            />
                            <CommandList>
                                <CommandGroup>
                                    <CommandItem value="new_chat" onSelect={() => choose({ type: 'new_chat' })}>
                                        ＋ {t.newChat}
                                    </CommandItem>
                                    {currentTitle && !search && (
                                        <CommandItem value="current_chat" onSelect={() => choose(undefined)}>
                                            {t.currentChat} · {currentTitle}
                                        </CommandItem>
                                    )}
                                </CommandGroup>
                                {results(true)}
                                {results(false)}
                                {loading && (
                                    <p role="status" className="p-2 text-sm text-muted-foreground">
                                        {t.loading}
                                    </p>
                                )}
                                {failed && (
                                    <p role="alert" className="p-2 text-sm text-destructive">
                                        {t.failed}
                                    </p>
                                )}
                                {!loading && !failed && !rows.length && (
                                    <p className="p-2 text-sm text-muted-foreground">{t.noMatches}</p>
                                )}
                                {next !== null && !loading && (
                                    <CommandItem value="more" onSelect={() => setOffset(next)}>
                                        {t.more}
                                    </CommandItem>
                                )}
                            </CommandList>
                        </Command>
                    </PopoverContent>
                </Popover>
            </div>
            <fieldset disabled={disabled} className="space-y-2">
                <legend className="text-sm font-medium text-muted-foreground">{t.frequency}</legend>
                <div className="divide-y divide-border rounded-lg border border-border px-3">
                    <div className="flex items-center justify-between gap-3 py-2">
                        <Label htmlFor="monitor-interval">{t.every}</Label>
                        <div className="flex items-center gap-2">
                            <Input
                                id="monitor-interval"
                                className="w-20"
                                type="number"
                                min={1}
                                step={1}
                                max={Math.floor(525600 / units[unit])}
                                required
                                value={amount}
                                onChange={(event) =>
                                    onInterval(
                                        event.target.valueAsNumber > 0 ? event.target.valueAsNumber * units[unit] : 0
                                    )
                                }
                            />
                            <Select
                                value={unit}
                                disabled={disabled}
                                onValueChange={(key) => {
                                    const u = z.enum(['minutes', 'hours', 'days', 'weeks']).parse(key)
                                    setUnit(u)
                                    onInterval(Number(amount || 1) * units[u])
                                }}
                            >
                                <SelectTrigger aria-label={t.intervalUnit} className="w-auto">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    {(Object.keys(units) as Unit[]).map((u) => (
                                        <SelectItem key={u} value={u}>
                                            {t[u]}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                    </div>
                    <div className="flex items-center justify-between gap-3 py-3 text-sm">
                        <span>{t.notify}</span>
                        <span>{t.newDifferences}</span>
                    </div>
                </div>
            </fieldset>
        </div>
    )
}
