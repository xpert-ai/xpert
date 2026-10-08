import { useLayoutEffect, useRef, useState } from 'react'
import {
    Search,
    ListFilter,
    Columns3,
    RotateCcw,
    ChevronDown,
    ChevronsDownUp,
    ChevronsUpDown,
    MoreHorizontal
} from 'lucide-react'
import {
    Button,
    Input,
    Popover,
    PopoverTrigger,
    PopoverContent,
    Checkbox,
    Label,
    buttonVariants,
    DropdownMenu,
    DropdownMenuTrigger,
    DropdownMenuContent,
    DropdownMenuCheckboxItem,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuSub,
    DropdownMenuSubTrigger,
    DropdownMenuSubContent,
    DropdownMenuRadioGroup,
    DropdownMenuRadioItem
} from '@xpert-ai/shadcn-ui'
import type { Node } from './bridge'
import type { Texts } from './i18n'
import { type Filters, type Grouping, type Sort, type View, statuses, owner } from './model'
import { Choice, IconButton } from './ui'
import { TimelineControls, TimelineMenuItems, type TimelineControlsProps } from './timeline-controls'

export type Fields = { status: boolean; assignee: boolean; attempts: boolean; dates: boolean }
export function Toolbar({
    t,
    tasks,
    view,
    filters,
    setFilters,
    grouping,
    setGrouping,
    sort,
    setSort,
    fields,
    setFields,
    collapseAll,
    expandAll,
    timeline
}: {
    t: Texts
    tasks: Node[]
    view: View
    filters: Filters
    setFilters: (value: Filters) => void
    grouping: Grouping
    setGrouping: (value: Grouping) => void
    sort: Sort
    setSort: (value: Sort) => void
    fields: Fields
    setFields: (fields: Fields) => void
    collapseAll: () => void
    expandAll: () => void
    timeline?: TimelineControlsProps
}) {
    const toolbar = useRef<HTMLDivElement>(null)
    const [width, setWidth] = useState(0)
    useLayoutEffect(() => {
        const element = toolbar.current
        if (!element) return
        const observer = new ResizeObserver(() =>
            setWidth(element.clientWidth / parseFloat(getComputedStyle(document.documentElement).fontSize))
        )
        observer.observe(element)
        return () => observer.disconnect()
    }, [])
    const wide = width >= (timeline ? 108 : 66)
    const showTimeline = width >= 44
    const hierarchical = view === 'tree' || (view !== 'board' && grouping === 'hierarchy')
    const groups: Array<{ value: Grouping; label: string }> = [
        { value: 'hierarchy', label: t.hierarchy },
        { value: 'none', label: t.none },
        { value: 'status', label: t.status },
        { value: 'assignee', label: t.assignee },
        { value: 'kind', label: t.kind }
    ]
    const sorts: Array<{ value: Sort; label: string }> = [
        { value: 'source', label: t.sourceOrder },
        { value: 'title', label: t.titleOrder },
        { value: 'start', label: t.startOrder }
    ]
    const changeGrouping = (value: string) => {
        if (value === 'hierarchy' || value === 'none' || value === 'status' || value === 'assignee' || value === 'kind')
            setGrouping(value)
    }
    const changeSort = (value: string) => {
        if (value === 'source' || value === 'title' || value === 'start') setSort(value)
    }
    const fieldItems = (['status', 'assignee', 'attempts', 'dates'] as const)
        .filter((key) => view !== 'gantt' || key === 'status' || key === 'assignee')
        .map((key) => (
            <DropdownMenuCheckboxItem
                key={key}
                checked={fields[key]}
                onSelect={(event) => event.preventDefault()}
                onCheckedChange={(checked) => setFields({ ...fields, [key]: checked })}
            >
                {key === 'dates' ? t.planned : t[key]}
            </DropdownMenuCheckboxItem>
        ))
    const count = filters.statuses.length + Number(!!filters.assignee) + Number(!!filters.kind)
    const owners = new Map(
        tasks.map((task) => [task.assigneeXpertId ?? 'unassigned', owner(task, t.unassigned, t.unnamedAssistant)])
    )
    return (
        <div
            ref={toolbar}
            role="toolbar"
            aria-label={t.actions}
            className="flex min-w-0 shrink-0 items-center gap-2 border-b px-3 py-1.5"
        >
            <div className="relative min-w-16 max-w-64 flex-1">
                <Search
                    aria-hidden
                    className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
                />
                <Input
                    aria-label={t.search}
                    placeholder={t.search}
                    value={filters.search}
                    onChange={(event) => setFilters({ ...filters, search: event.target.value })}
                    className="h-8 pl-8"
                />
            </div>
            <Popover>
                <PopoverTrigger className={buttonVariants({ variant: 'outline', size: 'sm', className: 'shrink-0' })}>
                    <ListFilter />
                    {t.filter}
                    {count > 0 && (
                        <span className="rounded-full bg-primary px-1.5 text-xs text-primary-foreground">{count}</span>
                    )}
                </PopoverTrigger>
                <PopoverContent align="start" className="w-72 space-y-4">
                    <p className="font-semibold">{t.filter}</p>
                    <div className="grid grid-cols-2 gap-3">
                        {statuses.map((status) => (
                            <Label key={status} className="gap-2">
                                <Checkbox
                                    checked={filters.statuses.includes(status)}
                                    onCheckedChange={(checked) =>
                                        setFilters({
                                            ...filters,
                                            statuses: checked
                                                ? [...filters.statuses, status]
                                                : filters.statuses.filter((item) => item !== status)
                                        })
                                    }
                                />
                                {t[status]}
                            </Label>
                        ))}
                    </div>
                    <div className="space-y-1">
                        <Label>{t.assignee}</Label>
                        <Choice
                            label={t.assignee}
                            value={filters.assignee || 'all'}
                            options={[
                                { value: 'all', label: t.all },
                                ...[...owners].map(([value, label]) => ({ value, label }))
                            ]}
                            onChange={(value) => setFilters({ ...filters, assignee: value === 'all' ? '' : value })}
                            className="w-full"
                        />
                    </div>
                    <div className="space-y-1">
                        <Label>{t.kind}</Label>
                        <Choice
                            label={t.kind}
                            value={filters.kind || 'all'}
                            options={['all', 'task', 'summary', 'milestone'].map((value) => ({
                                value,
                                label:
                                    value === 'all'
                                        ? t.all
                                        : value === 'task'
                                          ? t.task
                                          : value === 'summary'
                                            ? t.summary
                                            : t.milestone
                            }))}
                            onChange={(value) => setFilters({ ...filters, kind: value === 'all' ? '' : value })}
                            className="w-full"
                        />
                    </div>
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setFilters({ search: filters.search, statuses: [], assignee: '', kind: '' })}
                    >
                        <RotateCcw />
                        {t.clear}
                    </Button>
                </PopoverContent>
            </Popover>
            {wide && (
                <>
                    {view !== 'board' && (
                        <Choice
                            label={t.grouping}
                            value={view === 'tree' ? 'hierarchy' : grouping}
                            disabled={view === 'tree'}
                            options={groups.map(({ value, label }) => ({ value, label: `${t.grouping}: ${label}` }))}
                            onChange={changeGrouping}
                        />
                    )}
                    <Choice label={t.sort} value={sort} options={sorts} onChange={changeSort} />
                    {view !== 'board' && (
                        <DropdownMenu>
                            <DropdownMenuTrigger className={buttonVariants({ variant: 'ghost', size: 'sm' })}>
                                <Columns3 />
                                {t.fields}
                                <ChevronDown />
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">{fieldItems}</DropdownMenuContent>
                        </DropdownMenu>
                    )}
                    {hierarchical && (
                        <div className="flex shrink-0">
                            <IconButton label={t.expandAll} onClick={expandAll}>
                                <ChevronsUpDown />
                            </IconButton>
                            <IconButton label={t.collapseAll} onClick={collapseAll}>
                                <ChevronsDownUp />
                            </IconButton>
                        </div>
                    )}
                </>
            )}
            {timeline && showTimeline && <TimelineControls controls={timeline} t={t} compact={!wide} />}
            {!wide && (
                <DropdownMenu>
                    <DropdownMenuTrigger
                        aria-label={t.more}
                        title={t.more}
                        className={buttonVariants({ variant: 'ghost', size: 'icon-sm', className: 'shrink-0' })}
                    >
                        <MoreHorizontal />
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-64 max-w-[calc(100vw-1rem)]">
                        {view !== 'board' && (
                            <DropdownMenuSub>
                                <DropdownMenuSubTrigger disabled={view === 'tree'}>
                                    {t.grouping}:{' '}
                                    {
                                        groups.find((item) => item.value === (view === 'tree' ? 'hierarchy' : grouping))
                                            ?.label
                                    }
                                </DropdownMenuSubTrigger>
                                <DropdownMenuSubContent>
                                    <DropdownMenuRadioGroup value={grouping} onValueChange={changeGrouping}>
                                        {groups.map(({ value, label }) => (
                                            <DropdownMenuRadioItem key={value} value={value}>
                                                {label}
                                            </DropdownMenuRadioItem>
                                        ))}
                                    </DropdownMenuRadioGroup>
                                </DropdownMenuSubContent>
                            </DropdownMenuSub>
                        )}
                        <DropdownMenuSub>
                            <DropdownMenuSubTrigger>
                                {t.sort}: {sorts.find((item) => item.value === sort)?.label}
                            </DropdownMenuSubTrigger>
                            <DropdownMenuSubContent>
                                <DropdownMenuRadioGroup value={sort} onValueChange={changeSort}>
                                    {sorts.map(({ value, label }) => (
                                        <DropdownMenuRadioItem key={value} value={value}>
                                            {label}
                                        </DropdownMenuRadioItem>
                                    ))}
                                </DropdownMenuRadioGroup>
                            </DropdownMenuSubContent>
                        </DropdownMenuSub>
                        {view !== 'board' && (
                            <DropdownMenuSub>
                                <DropdownMenuSubTrigger>
                                    <Columns3 />
                                    {t.fields}
                                </DropdownMenuSubTrigger>
                                <DropdownMenuSubContent>{fieldItems}</DropdownMenuSubContent>
                            </DropdownMenuSub>
                        )}
                        {hierarchical && (
                            <>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem onSelect={expandAll}>
                                    <ChevronsUpDown />
                                    {t.expandAll}
                                </DropdownMenuItem>
                                <DropdownMenuItem onSelect={collapseAll}>
                                    <ChevronsDownUp />
                                    {t.collapseAll}
                                </DropdownMenuItem>
                            </>
                        )}
                        {timeline && <TimelineMenuItems controls={timeline} t={t} compact={!showTimeline} />}
                    </DropdownMenuContent>
                </DropdownMenu>
            )}
        </div>
    )
}
