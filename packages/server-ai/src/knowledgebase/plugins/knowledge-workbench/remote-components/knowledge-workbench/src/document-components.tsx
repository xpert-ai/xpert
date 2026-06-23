import * as React from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import {
    Badge,
    Button,
    TablerFileTypeDocxIcon,
    TablerFileTypePdfIcon,
    TablerFolderOpenFilledIcon,
    cn
} from '@xpert-ai/shadcn-ui'
import { Check, FileText } from 'lucide-react'
import { getLocale, t } from './i18n'
import type { DocumentRow } from './types'
import { dateValue, formatItemCount, formatListTime, isCompletedStatus } from './utils'

export function MarkdownPreview({ value }: { value: string }) {
    if (!value.trim()) {
        return null
    }
    return (
        <div className="space-y-3 break-words">
            <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                skipHtml
                components={{
                    h1: ({ className, ...props }) => <h1 className={cn('font-semibold', className)} {...props} />,
                    h2: ({ className, ...props }) => <h2 className={cn('font-semibold', className)} {...props} />,
                    h3: ({ className, ...props }) => <h3 className={cn('font-semibold', className)} {...props} />,
                    h4: ({ className, ...props }) => <h4 className={cn('font-semibold', className)} {...props} />,
                    p: ({ className, ...props }) => <p className={cn('break-words', className)} {...props} />,
                    a: ({ className, ...props }) => (
                        <a
                            className={cn('text-primary underline-offset-4 hover:underline', className)}
                            target="_blank"
                            rel="noreferrer"
                            {...props}
                        />
                    ),
                    ul: ({ className, ...props }) => (
                        <ul className={cn('list-disc space-y-1 pl-4', className)} {...props} />
                    ),
                    ol: ({ className, ...props }) => (
                        <ol className={cn('list-decimal space-y-1 pl-4', className)} {...props} />
                    ),
                    blockquote: ({ className, ...props }) => (
                        <blockquote className={cn('border-l-2 pl-3 text-muted-foreground', className)} {...props} />
                    ),
                    pre: ({ className, ...props }) => (
                        <pre
                            className={cn('overflow-x-auto rounded-md bg-muted p-3 font-mono', className)}
                            {...props}
                        />
                    ),
                    code: ({ className, children, ...props }) => {
                        const isBlock = String(children).includes('\n')
                        return (
                            <code
                                className={cn('font-mono', isBlock ? '' : 'rounded bg-muted px-1', className)}
                                {...props}
                            >
                                {children}
                            </code>
                        )
                    },
                    table: ({ className, ...props }) => (
                        <div className="overflow-x-auto">
                            <table className={cn('w-full border-collapse', className)} {...props} />
                        </div>
                    ),
                    th: ({ className, ...props }) => (
                        <th className={cn('border bg-muted px-2 py-1 text-left font-medium', className)} {...props} />
                    ),
                    td: ({ className, ...props }) => (
                        <td className={cn('border px-2 py-1 align-top', className)} {...props} />
                    ),
                    hr: ({ className, ...props }) => <hr className={cn('border-border', className)} {...props} />
                }}
            >
                {value}
            </ReactMarkdown>
        </div>
    )
}

export function DocumentListRow({
    row,
    active,
    selected,
    onOpen,
    onToggle
}: {
    row: DocumentRow
    active: boolean
    selected: boolean
    onOpen: () => void
    onToggle: () => void
}) {
    const kind = getDocumentKind(row)
    const meta = getDocumentMeta(row, kind)
    return (
        <div
            className={cn(
                'group grid min-h-[52px] grid-cols-[minmax(0,1fr)_2rem] items-center gap-1 rounded-lg px-1 py-0.5 transition-colors',
                active || selected ? 'bg-primary/10' : 'hover:bg-muted/40'
            )}
            onDoubleClick={onOpen}
        >
            <button
                className="grid min-h-[48px] min-w-0 grid-cols-[2.75rem_minmax(0,1fr)] items-center gap-2 rounded-lg text-left outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 max-[900px]:grid-cols-[2.5rem_minmax(0,1fr)]"
                onClick={onOpen}
            >
                <DocumentVisual row={row} kind={kind} />
                <span className="grid min-w-0 gap-1">
                    <strong className="truncate font-semibold text-foreground">{row.name || row.id}</strong>
                    <span className="flex min-w-0 items-center gap-1.5 truncate text-xs text-muted-foreground/65">
                        <span className="truncate">{meta.primary}</span>
                        {meta.secondary ? (
                            <>
                                <span className="text-border/80">|</span>
                                <span className="truncate">{meta.secondary}</span>
                            </>
                        ) : null}
                        {row.status && !isCompletedStatus(row.status) ? (
                            <Badge variant="outline" className="rounded-md px-1">
                                {row.status}
                            </Badge>
                        ) : null}
                    </span>
                </span>
            </button>
            {!row.isFolder ? (
                <Button
                    variant={selected ? 'secondary' : 'ghost'}
                    size="icon-sm"
                    className={cn(
                        'justify-self-end rounded-full transition-opacity',
                        selected ? 'opacity-100' : 'opacity-0 group-hover:opacity-100 group-focus-within:opacity-100'
                    )}
                    aria-label={t('selected')}
                    onClick={onToggle}
                >
                    {selected ? <Check className="size-4" /> : <FileText className="size-4" />}
                </Button>
            ) : null}
        </div>
    )
}

function DocumentVisual({ row, kind }: { row: DocumentRow; kind: DocumentKind }) {
    if (row.isFolder) {
        return <TablerFolderOpenFilledIcon className="h-8 w-8 text-emerald-400" />
    }
    if (kind.key === 'word') {
        return <TablerFileTypeDocxIcon className="h-9 w-9 text-blue-600" strokeWidth={1.8} />
    }
    if (kind.key === 'pdf') {
        return <TablerFileTypePdfIcon className="h-9 w-9 text-red-500" strokeWidth={1.8} />
    }

    return (
        <span
            className={cn(
                'relative flex h-10 w-8 items-center justify-center rounded-md border bg-card shadow-sm',
                'border-border'
            )}
            aria-hidden="true"
        >
            <FileText className="absolute left-1.5 top-1.5 size-3.5 text-muted-foreground/25" />
            <span className="absolute left-1.5 right-1.5 top-6 h-px bg-muted-foreground/15" />
            <span className="absolute left-1.5 right-3 top-8 h-px bg-muted-foreground/15" />
            <span className={cn('absolute bottom-1 left-1 rounded-sm px-0.5 font-bold text-white', kind.badgeClass)}>
                {kind.short}
            </span>
        </span>
    )
}

type DocumentKind = {
    key: 'folder' | 'pdf' | 'word' | 'sheet' | 'slide' | 'image' | 'text' | 'file'
    label: string
    short: string
    badgeClass: string
}

function getDocumentKind(row: DocumentRow): DocumentKind {
    if (row.isFolder) {
        return { key: 'folder', label: t('folder'), short: '', badgeClass: '' }
    }
    const raw = `${row.type ?? ''} ${row.mimeType ?? ''} ${row.name ?? ''}`.toLowerCase()
    if (raw.includes('pdf')) {
        return { key: 'pdf', label: 'PDF', short: 'PDF', badgeClass: 'bg-red-500' }
    }
    if (raw.includes('doc') || raw.includes('word')) {
        return { key: 'word', label: 'WORD', short: 'W', badgeClass: 'bg-blue-600' }
    }
    if (raw.includes('xls') || raw.includes('sheet') || raw.includes('excel')) {
        return { key: 'sheet', label: 'SHEET', short: 'X', badgeClass: 'bg-emerald-600' }
    }
    if (raw.includes('ppt') || raw.includes('presentation')) {
        return { key: 'slide', label: 'PPT', short: 'P', badgeClass: 'bg-orange-500' }
    }
    if (raw.includes('png') || raw.includes('jpg') || raw.includes('jpeg') || raw.includes('image')) {
        return { key: 'image', label: 'IMAGE', short: 'IMG', badgeClass: 'bg-violet-500' }
    }
    if (raw.includes('txt') || raw.includes('md') || raw.includes('markdown')) {
        return { key: 'text', label: 'TEXT', short: 'T', badgeClass: 'bg-slate-500' }
    }
    return {
        key: 'file',
        label: (row.type || t('document')).toUpperCase(),
        short: 'F',
        badgeClass: 'bg-muted-foreground'
    }
}

function getDocumentMeta(row: DocumentRow, kind: DocumentKind) {
    if (row.isFolder) {
        const count = row.chunkNum ?? row.tokenNum
        return {
            primary: typeof count === 'number' && count > 0 ? formatItemCount(count) : t('folder'),
            secondary: `${formatListTime(row.updatedAt)}${getLocale().startsWith('zh') ? '更新' : ' updated'}`
        }
    }
    return {
        primary: kind.label,
        secondary: formatListTime(row.updatedAt)
    }
}

export function sortDocumentRows(rows: DocumentRow[], sortMode: 'updated' | 'name') {
    return [...rows].sort((left, right) => {
        if (left.isFolder !== right.isFolder) {
            return left.isFolder ? -1 : 1
        }
        if (sortMode === 'name') {
            return (left.name || left.id).localeCompare(
                right.name || right.id,
                getLocale().startsWith('zh') ? 'zh-Hans' : 'en'
            )
        }
        return dateValue(right.updatedAt) - dateValue(left.updatedAt)
    })
}
