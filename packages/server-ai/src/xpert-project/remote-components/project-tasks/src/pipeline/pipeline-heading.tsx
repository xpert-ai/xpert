import { Button, Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@xpert-ai/shadcn-ui'
import type { PipelineSummary } from './bridge'

/** A single project flow needs a template title, not another project-like selector. */
export function PipelineHeading({
    title,
    items,
    instanceId,
    hasMore,
    busy,
    locale,
    onSelect,
    onMore
}: {
    title?: string
    items: PipelineSummary[]
    instanceId: string | null
    hasMore: boolean
    busy: boolean
    locale: string
    onSelect: (id: string) => void
    onMore: () => void
}) {
    const zh = locale.startsWith('zh')
    const multiple = items.length > 1 || hasMore
    return (
        <div className="flex min-w-0 items-center gap-2">
            <span className="max-w-64 truncate text-sm font-medium" title={title}>
                {title || (zh ? '项目流水线' : 'Project pipeline')}
            </span>
            {multiple && (
                <>
                    <Select value={instanceId ?? ''} onValueChange={onSelect}>
                        <SelectTrigger
                            className="w-52"
                            aria-label={zh ? '切换流水线' : 'Switch pipeline'}
                            title={items.find((item) => item.id === instanceId)?.title}
                        >
                            <SelectValue placeholder={zh ? '切换流水线' : 'Switch pipeline'} />
                        </SelectTrigger>
                        <SelectContent>
                            {items.map((item) => (
                                <SelectItem key={item.id} value={item.id}>
                                    {item.title}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                    {hasMore && (
                        <Button variant="ghost" size="sm" disabled={busy} onClick={onMore}>
                            {zh ? '更多流水线' : 'More pipelines'}
                        </Button>
                    )}
                </>
            )}
        </div>
    )
}
