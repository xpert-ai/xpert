import * as React from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import {
    Badge,
    Button,
    TablerFileCodeIcon,
    TablerFileDescriptionIcon,
    TablerFileIcon,
    TablerFileMusicIcon,
    TablerFileTypeDocxIcon,
    TablerFileTypeCsvIcon,
    TablerFileTypeHtmlIcon,
    TablerFileTypeJpgIcon,
    TablerFileTypePdfIcon,
    TablerFileTypePngIcon,
    TablerFileTypePptIcon,
    TablerFileTypeSvgIcon,
    TablerFileTypeTxtIcon,
    TablerFileTypeXlsIcon,
    TablerFileTypeZipIcon,
    TablerFolderOpenFilledIcon,
    TablerVideoIcon,
    cn
} from '@xpert-ai/shadcn-ui'
import { AlertCircle, Ban, Check, CheckCircle2, Clock, FileText, Info, Loader2, TriangleAlert } from 'lucide-react'
import { getLocale, t } from './i18n'
import type { DocumentRow, DocumentStatus } from './types'
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
                        <DocumentStatusBadge status={row.status} />
                        <DocumentWarningBadge metadata={row.metadata} />
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

type DocumentStatusInfo = {
    labelKey: Parameters<typeof t>[0]
    icon: React.ComponentType<{ className?: string }>
    className?: string
    loading?: boolean
}

type VisibleDocumentStatus = Exclude<DocumentStatus, 'finish'>

// Mirror the server status enum exhaustively; adding a new visible status should fail type-checking here.
const DOCUMENT_STATUS_INFO = {
    waiting: {
        labelKey: 'statusWaiting',
        icon: Clock,
        className: 'text-muted-foreground'
    },
    validate: {
        labelKey: 'statusValidating',
        icon: Info,
        className: 'text-muted-foreground'
    },
    running: {
        labelKey: 'statusRunning',
        icon: Loader2,
        className: 'border-primary/40 text-primary',
        loading: true
    },
    transformed: {
        labelKey: 'statusTransformed',
        icon: FileText,
        className: 'text-muted-foreground'
    },
    splitted: {
        labelKey: 'statusSplitted',
        icon: FileText,
        className: 'text-muted-foreground'
    },
    understood: {
        labelKey: 'statusUnderstood',
        icon: CheckCircle2,
        className: 'text-muted-foreground'
    },
    embedding: {
        labelKey: 'statusEmbedding',
        icon: Loader2,
        className: 'border-primary/40 text-primary',
        loading: true
    },
    cancel: {
        labelKey: 'statusCancelled',
        icon: Ban,
        className: 'text-muted-foreground'
    },
    error: {
        labelKey: 'statusError',
        icon: AlertCircle,
        className: 'border-destructive/40 text-destructive'
    }
} satisfies Record<VisibleDocumentStatus, DocumentStatusInfo>

function DocumentStatusBadge({ status }: { status?: DocumentStatus | null }) {
    if (!isVisibleDocumentStatus(status)) {
        return null
    }

    const statusInfo = DOCUMENT_STATUS_INFO[status]
    const StatusIcon = statusInfo.icon
    return (
        <Badge
            variant="outline"
            className={cn(
                'inline-flex shrink-0 items-center gap-1 rounded-md px-1.5 py-0 text-[11px] leading-5',
                statusInfo.className
            )}
        >
            <StatusIcon className={cn('size-3', statusInfo.loading ? 'animate-spin' : '')} />
            <span>{t(statusInfo.labelKey)}</span>
        </Badge>
    )
}

function DocumentWarningBadge({ metadata }: { metadata?: unknown }) {
    const warning = getImageUnderstandingWarning(metadata)
    if (!warning) {
        return null
    }

    return (
        <Badge
            variant="outline"
            className="inline-flex shrink-0 items-center gap-1 rounded-md border-text-warning/40 px-1.5 py-0 text-[11px] leading-5 text-text-warning"
            title={warning.message}
        >
            <TriangleAlert className="size-3" />
            <span>{t('imageUnderstandingWarning')}</span>
        </Badge>
    )
}

function isVisibleDocumentStatus(status?: DocumentStatus | null): status is VisibleDocumentStatus {
    return Boolean(status) && !isCompletedStatus(status)
}

function getImageUnderstandingWarning(metadata?: unknown) {
    if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) {
        return null
    }

    const warnings = (metadata as Record<string, unknown>).imageUnderstandingWarnings
    if (!Array.isArray(warnings)) {
        return null
    }
    const first = warnings.find((warning) => warning && typeof warning === 'object') as
        | Record<string, unknown>
        | undefined
    const message = typeof first?.message === 'string' ? first.message : ''
    return first ? { message } : null
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
    if (kind.key === 'sheet') {
        return <TablerFileTypeXlsIcon className="h-9 w-9 text-emerald-600" strokeWidth={1.8} />
    }
    if (kind.key === 'csv') {
        return <TablerFileTypeCsvIcon className="h-9 w-9 text-emerald-600" strokeWidth={1.8} />
    }
    if (kind.key === 'slide') {
        return <TablerFileTypePptIcon className="h-9 w-9 text-orange-500" strokeWidth={1.8} />
    }
    if (kind.key === 'image') {
        return <TablerFileTypeJpgIcon className="h-9 w-9 text-violet-500" strokeWidth={1.8} />
    }
    if (kind.key === 'png') {
        return <TablerFileTypePngIcon className="h-9 w-9 text-violet-500" strokeWidth={1.8} />
    }
    if (kind.key === 'svg') {
        return <TablerFileTypeSvgIcon className="h-9 w-9 text-violet-500" strokeWidth={1.8} />
    }
    if (kind.key === 'html') {
        return <TablerFileTypeHtmlIcon className="h-9 w-9 text-orange-500" strokeWidth={1.8} />
    }
    if (kind.key === 'markdown') {
        return <TablerFileDescriptionIcon className="h-9 w-9 text-slate-500" strokeWidth={1.8} />
    }
    if (kind.key === 'text') {
        return <TablerFileTypeTxtIcon className="h-9 w-9 text-slate-500" strokeWidth={1.8} />
    }
    if (kind.key === 'code') {
        return <TablerFileCodeIcon className="h-9 w-9 text-slate-500" strokeWidth={1.8} />
    }
    if (kind.key === 'audio') {
        return <TablerFileMusicIcon className="h-9 w-9 text-violet-500" strokeWidth={1.8} />
    }
    if (kind.key === 'video') {
        return <TablerVideoIcon className="h-9 w-9 text-violet-500" strokeWidth={1.8} />
    }
    if (kind.key === 'archive') {
        return <TablerFileTypeZipIcon className="h-9 w-9 text-muted-foreground" strokeWidth={1.8} />
    }

    return <TablerFileIcon className="h-9 w-9 text-muted-foreground" strokeWidth={1.8} />
}

type DocumentKind = {
    key:
        | 'folder'
        | 'pdf'
        | 'word'
        | 'sheet'
        | 'csv'
        | 'slide'
        | 'image'
        | 'png'
        | 'svg'
        | 'video'
        | 'audio'
        | 'html'
        | 'markdown'
        | 'text'
        | 'code'
        | 'archive'
        | 'file'
    label: string
}

function getDocumentKind(row: DocumentRow): DocumentKind {
    if (row.isFolder) {
        return { key: 'folder', label: t('folder') }
    }
    // Prefer extension evidence over MIME/category/type because some uploads keep generic backend labels.
    const kindKey =
        resolveKindFromExtension(row.name, row.filePath, row.fileUrl) ??
        resolveKindFromMime(row.mimeType) ??
        resolveKindFromCategory(row.category) ??
        resolveKindFromType(row.type) ??
        'file'

    return getDocumentKindDefinition(kindKey, row.type)
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

type DocumentKindKey = Exclude<DocumentKind['key'], 'folder'>

// Keep extension-specific keys where the UI has a dedicated file-type icon.
const EXTENSION_KIND: Record<string, DocumentKindKey> = {
    doc: 'word',
    docx: 'word',
    dot: 'word',
    dotx: 'word',
    pdf: 'pdf',
    xls: 'sheet',
    xlsx: 'sheet',
    xlsm: 'sheet',
    xlsb: 'sheet',
    csv: 'csv',
    ods: 'sheet',
    ppt: 'slide',
    pptx: 'slide',
    pps: 'slide',
    ppsx: 'slide',
    odp: 'slide',
    png: 'png',
    jpg: 'image',
    jpeg: 'image',
    gif: 'image',
    webp: 'image',
    svg: 'svg',
    bmp: 'image',
    mp4: 'video',
    mov: 'video',
    avi: 'video',
    webm: 'video',
    mp3: 'audio',
    wav: 'audio',
    m4a: 'audio',
    flac: 'audio',
    html: 'html',
    htm: 'html',
    md: 'markdown',
    mdx: 'markdown',
    markdown: 'markdown',
    txt: 'text',
    json: 'code',
    yaml: 'code',
    yml: 'code',
    xml: 'code',
    zip: 'archive',
    rar: 'archive',
    '7z': 'archive',
    tar: 'archive',
    gz: 'archive'
}

function resolveKindFromExtension(...values: Array<string | null | undefined>): DocumentKindKey | undefined {
    for (const value of values) {
        const extension = getExtension(value)
        if (extension && EXTENSION_KIND[extension]) {
            return EXTENSION_KIND[extension]
        }
    }
    return undefined
}

function getExtension(value: string | null | undefined) {
    if (!value?.trim()) {
        return undefined
    }
    const normalized = value.trim().split(/[?#]/)[0]
    const fileName = normalized.split(/[\\/]/).pop() ?? normalized
    const dotIndex = fileName.lastIndexOf('.')
    if (dotIndex <= 0 || dotIndex === fileName.length - 1) {
        return undefined
    }
    return fileName.slice(dotIndex + 1).toLowerCase()
}

function resolveKindFromMime(mimeType: string | null | undefined): DocumentKindKey | undefined {
    const mime = mimeType?.toLowerCase() ?? ''
    if (!mime) {
        return undefined
    }
    if (mime.includes('pdf')) {
        return 'pdf'
    }
    if (mime.includes('spreadsheet') || mime.includes('excel') || mime.includes('csv')) {
        return mime.includes('csv') ? 'csv' : 'sheet'
    }
    if (mime.includes('presentation') || mime.includes('powerpoint')) {
        return 'slide'
    }
    if (mime.includes('word') || mime.includes('document')) {
        return 'word'
    }
    if (mime.startsWith('image/')) {
        return 'image'
    }
    if (mime.startsWith('video/')) {
        return 'video'
    }
    if (mime.startsWith('audio/')) {
        return 'audio'
    }
    if (mime.includes('html')) {
        return 'html'
    }
    if (mime.includes('markdown')) {
        return 'markdown'
    }
    if (mime.includes('json') || mime.includes('xml') || mime.includes('yaml')) {
        return 'code'
    }
    if (mime.includes('zip') || mime.includes('compressed') || mime.includes('archive')) {
        return 'archive'
    }
    if (mime.startsWith('text/')) {
        return 'text'
    }
    return undefined
}

function resolveKindFromCategory(category: string | null | undefined): DocumentKindKey | undefined {
    if (category === 'sheet') {
        return 'sheet'
    }
    if (category === 'image') {
        return 'image'
    }
    if (category === 'video') {
        return 'video'
    }
    if (category === 'audio') {
        return 'audio'
    }
    if (category === 'text') {
        return 'text'
    }
    return undefined
}

function resolveKindFromType(type: string | null | undefined): DocumentKindKey | undefined {
    const normalized = type?.trim().toLowerCase()
    if (!normalized) {
        return undefined
    }
    return EXTENSION_KIND[normalized] ?? resolveKindFromMime(normalized)
}

function getDocumentKindDefinition(kind: DocumentKindKey, fallbackType?: string | null): DocumentKind {
    switch (kind) {
        case 'pdf':
            return { key: 'pdf', label: 'PDF' }
        case 'word':
            return { key: 'word', label: 'WORD' }
        case 'sheet':
            return { key: 'sheet', label: 'SHEET' }
        case 'csv':
            return { key: 'csv', label: 'CSV' }
        case 'slide':
            return { key: 'slide', label: 'PPT' }
        case 'image':
            return { key: 'image', label: 'IMAGE' }
        case 'png':
            return { key: 'png', label: 'PNG' }
        case 'svg':
            return { key: 'svg', label: 'SVG' }
        case 'video':
            return { key: 'video', label: 'VIDEO' }
        case 'audio':
            return { key: 'audio', label: 'AUDIO' }
        case 'html':
            return { key: 'html', label: 'HTML' }
        case 'markdown':
            return { key: 'markdown', label: 'MARKDOWN' }
        case 'text':
            return { key: 'text', label: 'TEXT' }
        case 'code':
            return { key: 'code', label: 'CODE' }
        case 'archive':
            return { key: 'archive', label: 'ARCHIVE' }
        default:
            return {
                key: 'file',
                label: (fallbackType || t('document')).toUpperCase()
            }
    }
}
