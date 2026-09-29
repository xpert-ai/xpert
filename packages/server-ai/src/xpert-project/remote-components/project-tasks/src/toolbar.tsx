import type { ReactNode } from 'react'
import { Search, ListFilter, Columns3, RotateCcw, ChevronDown, ChevronsDownUp, ChevronsUpDown } from 'lucide-react'
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
    DropdownMenuCheckboxItem
} from '@xpert-ai/shadcn-ui'
import type { Node } from './bridge'
import type { Texts } from './i18n'
import { type Filters, type Grouping, type Sort, type View, statuses, owner } from './model'
import { Choice, IconButton } from './ui'

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
    children
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
    children?: ReactNode
}) {
    const count = filters.statuses.length + Number(!!filters.assignee) + Number(!!filters.kind)
    const owners = new Map(
        tasks.map((task) => [task.assigneeXpertId ?? 'unassigned', owner(task, t.unassigned, t.unnamedAssistant)])
    )
    return (
        <div className="flex shrink-0 items-center gap-2 overflow-x-auto border-b px-3 py-1.5 [&>*]:shrink-0">
            <div className="relative w-40">
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
                <PopoverTrigger className={buttonVariants({ variant: 'outline', size: 'sm' })}>
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
            {view !== 'board' && (
                <Choice
                    label={t.grouping}
                    value={view === 'tree' ? 'hierarchy' : grouping}
                    disabled={view === 'tree'}
                    options={(
                        [
                            ['hierarchy', t.hierarchy],
                            ['none', t.none],
                            ['status', t.status],
                            ['assignee', t.assignee],
                            ['kind', t.kind]
                        ] as const
                    ).map(([value, label]) => ({ value, label: `${t.grouping}: ${label}` }))}
                    onChange={(value) => {
                        if (
                            value === 'hierarchy' ||
                            value === 'none' ||
                            value === 'status' ||
                            value === 'assignee' ||
                            value === 'kind'
                        )
                            setGrouping(value)
                    }}
                />
            )}
            <Choice
                label={t.sort}
                value={sort}
                options={[
                    { value: 'source', label: t.sourceOrder },
                    { value: 'title', label: t.titleOrder },
                    { value: 'start', label: t.startOrder }
                ]}
                onChange={(value) => {
                    if (value === 'source' || value === 'title' || value === 'start') setSort(value)
                }}
            />
            {view !== 'board' && (
                <DropdownMenu>
                    <DropdownMenuTrigger className={buttonVariants({ variant: 'ghost', size: 'sm' })}>
                        <Columns3 />
                        {t.fields}
                        <ChevronDown />
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                        {(['status', 'assignee', 'attempts', 'dates'] as const)
                            .filter((key) => view !== 'gantt' || key === 'status' || key === 'assignee')
                            .map((key) => (
                                <DropdownMenuCheckboxItem
                                    key={key}
                                    checked={fields[key]}
                                    onCheckedChange={(checked) => setFields({ ...fields, [key]: checked })}
                                >
                                    {key === 'dates' ? t.planned : t[key]}
                                </DropdownMenuCheckboxItem>
                            ))}
                    </DropdownMenuContent>
                </DropdownMenu>
            )}
            {(view === 'tree' || (view !== 'board' && grouping === 'hierarchy')) && (
                <div className="flex">
                    <IconButton label={t.expandAll} onClick={expandAll}>
                        <ChevronsUpDown />
                    </IconButton>
                    <IconButton label={t.collapseAll} onClick={collapseAll}>
                        <ChevronsDownUp />
                    </IconButton>
                </div>
            )}
            {children}
        </div>
    )
}
