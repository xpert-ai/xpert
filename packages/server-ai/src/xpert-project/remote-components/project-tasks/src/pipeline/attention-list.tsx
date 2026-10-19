import { useEffect, useState } from 'react'
import { AlertCircle, ChevronRight, X } from 'lucide-react'
import { Button, Dialog, DialogContent, DialogDescription, DialogTitle } from '@xpert-ai/shadcn-ui'
import type { PipelineGraph } from './bridge'
import type { PipelineTexts } from './i18n'

export function PipelineAttentionList({
    graph,
    t,
    onSelect
}: {
    graph: PipelineGraph
    t: PipelineTexts
    onSelect: (nodeId: string) => void
}) {
    const [open, setOpen] = useState(false)
    const items = graph.attentions.filter((item) => item.state === 'open')
    useEffect(() => {
        if (!items.length) setOpen(false)
    }, [items.length])
    if (!items.length) return null
    return (
        <>
            <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
                <AlertCircle />
                {t.attentionList} ({items.length})
            </Button>
            <Dialog open={open} onOpenChange={setOpen}>
                <DialogContent
                    showCloseButton={false}
                    className="flex max-h-[85dvh] flex-col gap-0 overflow-hidden p-0 sm:max-w-xl"
                >
                    <div className="flex items-center justify-between border-b px-4 py-3">
                        <DialogTitle>{t.attentionList}</DialogTitle>
                        <Button variant="ghost" size="icon" aria-label={t.close} onClick={() => setOpen(false)}>
                            <X />
                        </Button>
                    </div>
                    <div className="min-h-0 overflow-y-auto p-4">
                        <DialogDescription>{t.attentionListHint}</DialogDescription>
                        <div className="mt-3 divide-y">
                            {items.map((item) => {
                                const node = graph.nodes.find((node) => node.id === item.nodeInstanceId)
                                return (
                                    <div
                                        key={`${item.source ?? 'coordinator'}:${item.id}`}
                                        className="flex items-center gap-3 py-3"
                                    >
                                        <div className="min-w-0 flex-1">
                                            <p className="truncate text-sm font-medium">
                                                {node?.projection.title ?? t.details}
                                            </p>
                                            <p className="mt-1 text-xs text-muted-foreground">
                                                {item.reasonCode === 'MODEL_BUDGET_EXCEEDED'
                                                    ? t.modelBudgetAttention
                                                    : item.kind === 'human'
                                                      ? t.needsYou
                                                      : item.kind === 'unknown'
                                                        ? t.unconfirmedAttention
                                                        : t.blockedAttention}
                                            </p>
                                        </div>
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            disabled={!node}
                                            onClick={() => {
                                                setOpen(false)
                                                onSelect(item.nodeInstanceId)
                                            }}
                                        >
                                            {t.details}
                                            <ChevronRight />
                                        </Button>
                                    </div>
                                )
                            })}
                        </div>
                    </div>
                </DialogContent>
            </Dialog>
        </>
    )
}
