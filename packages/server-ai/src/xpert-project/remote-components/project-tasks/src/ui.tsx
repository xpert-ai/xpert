import * as React from 'react'
import {
    Circle,
    CircleCheck,
    CircleDashed,
    CirclePause,
    CircleX,
    LoaderCircle,
    SearchCheck,
    TriangleAlert,
    ChevronDown,
    ChevronRight
} from 'lucide-react'
import {
    Button,
    Tooltip,
    TooltipTrigger,
    TooltipContent,
    buttonVariants,
    cn,
    Select,
    SelectTrigger,
    SelectValue,
    SelectContent,
    SelectItem
} from '@xpert-ai/shadcn-ui'
import type { Node } from './bridge'
import type { Texts } from './i18n'
import type { TaskRow } from './model'
import { TaskTypeIcon } from './task-type-icon'

export const statusStyle: { [K in Node['status']]: string } = {
    todo: 'text-muted-foreground',
    in_progress: 'text-primary',
    review: 'text-[var(--warning)]',
    blocked: 'text-destructive',
    paused: 'text-muted-foreground',
    done: 'text-[var(--success)]',
    cancelled: 'text-muted-foreground'
}
const statusIcon = {
    todo: Circle,
    in_progress: LoaderCircle,
    review: SearchCheck,
    blocked: TriangleAlert,
    paused: CirclePause,
    done: CircleCheck,
    cancelled: CircleX
}
export function Status({ value, t }: { value: Node['status']; t: Texts }) {
    const Icon = statusIcon[value]
    return (
        <span
            className={cn('inline-flex items-center gap-1.5 whitespace-nowrap text-xs font-medium', statusStyle[value])}
        >
            <Icon aria-hidden className="size-3.5 shrink-0" />
            {t[value]}
        </span>
    )
}
export function IconButton({
    label,
    tooltip,
    children,
    className,
    ...props
}: React.ComponentProps<'button'> & { label: string; tooltip?: string }) {
    return (
        <Tooltip>
            <TooltipTrigger
                aria-label={label}
                className={cn(buttonVariants({ variant: 'ghost', size: 'icon-sm' }), className)}
                {...props}
            >
                {children}
            </TooltipTrigger>
            <TooltipContent>{tooltip ?? label}</TooltipContent>
        </Tooltip>
    )
}
export function Choice({
    label,
    value,
    options,
    onChange,
    disabled,
    className
}: {
    label: string
    value: string
    options: Array<{ value: string; label: string }>
    onChange: (value: string) => void
    disabled?: boolean
    className?: string
}) {
    return (
        <Select value={value} onValueChange={onChange} disabled={disabled}>
            <SelectTrigger size="sm" aria-label={label} className={className}>
                <SelectValue />
            </SelectTrigger>
            <SelectContent>
                {options.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                        {option.label}
                    </SelectItem>
                ))}
            </SelectContent>
        </Select>
    )
}
export function TaskName({
    row,
    collapsed,
    toggle,
    select,
    t,
    locale
}: {
    row: TaskRow
    collapsed: Set<string>
    toggle: (id: string) => void
    select: (task: Node) => void
    t: Texts
    locale: string
}) {
    return (
        <div className="flex min-w-0 items-center gap-1" style={{ paddingLeft: Math.min(row.depth, 6) * 16 }}>
            {row.hasChildren ? (
                <Button
                    variant="ghost"
                    size="icon-xs"
                    aria-label={`${collapsed.has(row.task.id) ? t.expand : t.collapse} ${row.task.title}`}
                    aria-expanded={!collapsed.has(row.task.id)}
                    onClick={() => toggle(row.task.id)}
                >
                    {collapsed.has(row.task.id) ? <ChevronRight /> : <ChevronDown />}
                </Button>
            ) : (
                <span className="w-6 shrink-0" />
            )}
            <TaskTypeIcon task={row.task} locale={locale} fallbackLabel={t[row.task.kind]} />
            <button
                className={cn(
                    'min-w-0 truncate rounded px-1 py-1.5 text-left text-sm hover:underline focus-visible:outline-ring',
                    row.task.kind === 'summary' && 'font-semibold',
                    row.contextOnly && 'text-muted-foreground'
                )}
                title={row.task.title}
                onClick={() => select(row.task)}
            >
                {row.task.title}
            </button>
        </div>
    )
}
export function Empty({ title, hint, children }: { title: string; hint?: string; children?: React.ReactNode }) {
    return (
        <div className="flex min-h-52 flex-1 flex-col items-center justify-center gap-3 p-8 text-center">
            <CircleDashed aria-hidden className="size-8 text-muted-foreground" />
            <p className="font-medium">{title}</p>
            {hint && <p className="max-w-sm text-sm text-muted-foreground">{hint}</p>}
            {children}
        </div>
    )
}
