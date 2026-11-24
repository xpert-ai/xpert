import type { PipelineSummary } from './bridge'
import { PipelineInstanceSelect, type InstanceCatalog } from './instance-select'
import { pipelineTexts } from './i18n'

export function PipelineHeading({
    title,
    instanceId,
    locale,
    onSelect,
    ...catalog
}: InstanceCatalog & {
    title?: string
    instanceId: string | null
    locale: string
    onSelect: (item: PipelineSummary) => void
}) {
    const t = pipelineTexts(locale)
    return (
        <div className="flex min-w-0 items-center gap-2">
            <span className="max-w-64 truncate text-sm font-medium" title={title}>
                {title || (locale.startsWith('zh') ? '项目流水线' : 'Project pipeline')}
            </span>
            {(catalog.items.length > 1 || catalog.hasMore) && (
                <PipelineInstanceSelect
                    catalog={catalog}
                    currentTitle={catalog.items.find((item) => item.id === instanceId)?.title}
                    label={t.switchInstance}
                    instanceId={instanceId}
                    locale={locale}
                    onSelect={onSelect}
                    className="w-52"
                />
            )}
        </div>
    )
}
