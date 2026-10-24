import { pipelineExecutions } from './executions'
import { ExecutionIndicators } from '../execution-indicators'
import { useState } from 'react'
import { NodeDiagnostics } from './node-diagnostics'
import {
    Button,
    Dialog,
    DialogContent,
    DialogHeader,
    Accordion,
    AccordionItem,
    AccordionTrigger,
    AccordionContent,
    DialogTitle,
    DialogDescription
} from '@xpert-ai/shadcn-ui'
import { Assignee } from '../assignee'
import { texts } from '../i18n'
import type { PipelineGraph, PipelineNode } from './bridge'
import type { PipelineTexts } from './i18n'

export function LaneDetails({
    graph,
    laneKey,
    locale,
    t,
    close,
    select,
    onError
}: {
    graph: PipelineGraph
    laneKey: string
    locale: string
    t: PipelineTexts
    close: () => void
    select: (node: PipelineNode) => void
    onError: (message: string) => void
}) {
    const lane = graph.definition.lanes.find((item) => item.key === laneKey)
    const nodes = graph.nodes.filter((node) => node.projection.laneKey === laneKey)
    const taskIds = new Set(nodes.flatMap((node) => node.taskIds))
    const tasks = graph.tasks.tasks.filter((task) => taskIds.has(task.id))
    const owners = [
        ...new Map(tasks.filter((task) => task.assigneeXpertId).map((task) => [task.assigneeXpertId, task])).values()
    ]
    const unique = (fields: Array<{ label: string; value: string }>) => [
        ...new Map(fields.map((field) => [JSON.stringify(field), field])).values()
    ]
    const fields = unique(nodes.flatMap((node) => node.projection.presentation?.roleDetails ?? []))
    const technical = unique(nodes.flatMap((node) => node.projection.presentation?.technicalDetails ?? []))
    return (
        <Dialog
            open={!!lane}
            onOpenChange={(open) => {
                if (!open) close()
            }}
        >
            <DialogContent className="max-h-[85dvh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle>{lane?.label}</DialogTitle>
                    <DialogDescription>{t.laneDetails}</DialogDescription>
                </DialogHeader>
                <p className="text-xs text-muted-foreground">
                    {graph.permissions.canEdit ? t.projectEditable : t.projectReadOnly}
                </p>
                <p className="text-sm">{t.assignedAssistants}</p>
                {owners.length ? (
                    owners.map((task) => (
                        <Assignee
                            key={task.id}
                            task={task}
                            attempts={[]}
                            t={texts(locale)}
                            locale={locale}
                            onError={onError}
                        />
                    ))
                ) : (
                    <p className="text-sm text-muted-foreground">{t.executorUnknown}</p>
                )}
                <ExecutionIndicators
                    title={lane?.label ?? laneKey}
                    attempts={pipelineExecutions(graph, nodes)}
                    t={texts(locale)}
                    locale={locale}
                    onError={onError}
                />
                {!!fields.length && (
                    <dl className="grid grid-cols-2 gap-3 text-sm">
                        {fields.map((field) => (
                            <div key={JSON.stringify(field)}>
                                <dt className="text-xs text-muted-foreground">{field.label}</dt>
                                <dd className="break-words">{field.value}</dd>
                            </div>
                        ))}
                    </dl>
                )}
                <div className="space-y-2 border-t pt-3">
                    {nodes.map((node) => (
                        <Button
                            key={node.id}
                            className="w-full justify-between"
                            variant="outline"
                            onClick={() => {
                                close()
                                select(node)
                            }}
                        >
                            <span className="truncate">{node.projection.title}</span>
                            <span>
                                {
                                    t[
                                        node.projection.state.freshness === 'superseded'
                                            ? 'superseded'
                                            : node.projection.state.applicability !== 'selected'
                                              ? node.projection.state.applicability
                                              : ['pending', 'active'].includes(node.projection.state.lifecycle)
                                                ? node.projection.state.readiness
                                                : node.projection.state.lifecycle
                                    ]
                                }
                            </span>
                        </Button>
                    ))}
                </div>
                {!graph.historical &&
                    graph.instance.authority === 'provider' &&
                    nodes.some((node) => node.projection.presentation) && (
                        <div className="space-y-2">
                            {nodes.map((node) => (
                                <LaneNodeDiagnostics key={node.id} graph={graph} node={node} t={t} />
                            ))}
                        </div>
                    )}
                <Accordion type="single" collapsible>
                    <AccordionItem value="technical">
                        <AccordionTrigger>{t.technicalDetails}</AccordionTrigger>
                        <AccordionContent>
                            <p>{lane?.roleKey}</p>
                            {technical.map((field) => (
                                <p className="break-words" key={JSON.stringify(field)}>
                                    {field.label}: {field.value}
                                </p>
                            ))}
                        </AccordionContent>
                    </AccordionItem>
                </Accordion>
            </DialogContent>
        </Dialog>
    )
}

function LaneNodeDiagnostics({ graph, node, t }: { graph: PipelineGraph; node: PipelineNode; t: PipelineTexts }) {
    const [open, setOpen] = useState(false)
    return (
        <Accordion
            type="single"
            collapsible
            value={open ? 'diagnostics' : ''}
            onValueChange={(value) => setOpen(value === 'diagnostics')}
        >
            <AccordionItem value="diagnostics">
                <AccordionTrigger>
                    {node.projection.title} · {t.providerActions}
                </AccordionTrigger>
                <AccordionContent>{open && <NodeDiagnostics graph={graph} node={node} t={t} />}</AccordionContent>
            </AccordionItem>
        </Accordion>
    )
}
