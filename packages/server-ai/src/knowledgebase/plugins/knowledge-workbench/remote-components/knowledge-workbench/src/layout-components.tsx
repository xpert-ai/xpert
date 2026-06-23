import * as React from 'react'
import { Button, TablerFoldersIcon, Tooltip, TooltipContent, TooltipTrigger, cn } from '@xpert-ai/shadcn-ui'
import { Settings } from 'lucide-react'
import { t } from './i18n'
import type { DocumentRow, KnowledgebaseRow } from './types'
import { getAvatarEmoji, getAvatarUrl } from './utils'

export function IconButton(props: React.ComponentProps<typeof Button>) {
    const { title, children, ...rest } = props
    return (
        <Tooltip>
            <TooltipTrigger asChild>
                <Button variant="outline" size="icon-sm" aria-label={title} {...rest}>
                    {children}
                </Button>
            </TooltipTrigger>
            {title ? <TooltipContent>{title}</TooltipContent> : null}
        </Tooltip>
    )
}

export function KnowledgebaseOverview({
    knowledgebase,
    breadcrumb,
    onRoot,
    onNavigate,
    onManage
}: {
    knowledgebase: KnowledgebaseRow | null
    breadcrumb: Array<{ id: string; name?: string }>
    onRoot: () => void
    onNavigate: (item: { id: string; name?: string }) => void
    onManage: () => void
}) {
    const avatarUrl = getAvatarUrl(knowledgebase?.avatar)
    const emoji = getAvatarEmoji(knowledgebase?.avatar)
    const hasCustomAvatar = Boolean(avatarUrl || emoji)
    return (
        <section className="flex min-h-16 items-center gap-3 border-b px-4 py-3 max-[900px]:px-3">
            <span
                className={cn(
                    'grid size-10 shrink-0 place-items-center overflow-hidden rounded-lg',
                    hasCustomAvatar ? 'border bg-card text-muted-foreground' : ''
                )}
                aria-hidden="true"
            >
                {avatarUrl ? (
                    <img src={avatarUrl} alt="" className="size-full object-cover" />
                ) : emoji ? (
                    <span>{emoji}</span>
                ) : (
                    <TablerFoldersIcon className="size-10 text-emerald-500" strokeWidth={1.8} />
                )}
            </span>
            <div className="grid min-w-0 flex-1 gap-1">
                <div className="truncate font-semibold">{knowledgebase?.name || t('knowledgebase')}</div>
                {knowledgebase?.description ? (
                    <p className="truncate text-xs text-muted-foreground/65">{knowledgebase.description}</p>
                ) : null}
                <div className="flex min-w-0 items-center gap-1 overflow-hidden whitespace-nowrap text-xs text-muted-foreground/65">
                    <Button
                        variant="ghost"
                        size="xs"
                        className="h-5 max-w-[180px] px-1 text-muted-foreground"
                        onClick={onRoot}
                    >
                        {t('allDocuments')}
                    </Button>
                    {breadcrumb.map((item) => (
                        <React.Fragment key={item.id}>
                            <span className="text-border/80">/</span>
                            <Button
                                variant="ghost"
                                size="xs"
                                className="h-5 max-w-[150px] truncate px-1 text-muted-foreground"
                                onClick={() => onNavigate(item)}
                            >
                                {item.name || item.id}
                            </Button>
                        </React.Fragment>
                    ))}
                </div>
            </div>
            <IconButton
                title={t('manageKnowledgebase')}
                variant="ghost"
                size="icon-xs"
                className="shrink-0 text-muted-foreground hover:bg-muted"
                onClick={onManage}
                disabled={!knowledgebase?.id}
            >
                <Settings className="size-3.5" />
            </IconButton>
        </section>
    )
}
