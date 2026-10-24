import { pipelineExecutions } from './executions'
import { executionSummary, executionDuration, formatExecutionDuration } from '../execution-summary'
import { attemptTimes, isRunning } from '../model'
import { texts, dateTime } from '../i18n'
import { useState } from 'react'
import { FileText, ExternalLink } from 'lucide-react'
import {
    Button,
    Dialog,
    DialogContent,
    DialogHeader,
    DialogFooter,
    DialogClose,
    Badge,
    Accordion,
    AccordionItem,
    AccordionTrigger,
    AccordionContent,
    DialogTitle,
    DialogDescription,
    Tabs,
    TabsList,
    TabsTrigger,
    TabsContent
} from '@xpert-ai/shadcn-ui'
import type { Graph, Node } from '../bridge'
import { openTaskExecution } from '../execution-navigation'
import type { PipelineGraph, PipelineNode } from './bridge'
import type { PipelineTexts } from './i18n'
import { NodePresentation } from './node-presentation'
import { NodeDiagnostics } from './node-diagnostics'
import { PipelineAttention } from './attention'
import { PipelineLifecycle } from './lifecycle'
import { ProviderActions } from './provider-actions'
import { PipelineEvidence } from './evidence'
import { PipelineNodeEntry } from './node-entry'

export function PipelineNodeDialog({
    graph,
    node,
    locale,
    projectId,
    t,
    reload,
    close,
    onTask,
    now = Date.now()
}: {
    graph: PipelineGraph
    node: PipelineNode
    locale: string
    projectId?: string
    t: PipelineTexts
    now?: number
    reload: () => Promise<void>
    close: () => void
    onTask: (task: Node, graph: Graph) => void
}) {
    const [error, setError] = useState('')
    const tasks = graph.tasks.tasks.filter((task) => node.taskIds.includes(task.id))
    const attempts = pipelineExecutions(graph, [node])
    const taskTexts = texts(locale)
    const observedAt =
        graph.historical && !graph.executionAttribution ? (graph.snapshotAt ? Date.parse(graph.snapshotAt) : NaN) : now
    const lane = graph.definition.lanes.find((lane) => lane.key === node.projection.laneKey)
    return (
        <Dialog
            open
            onOpenChange={(open) => {
                if (!open) close()
            }}
        >
            <DialogContent className="flex max-h-[90dvh] flex-col overflow-hidden sm:max-w-2xl">
                <DialogHeader>
                    <DialogTitle>{node.projection.title}</DialogTitle>
                    <DialogDescription>
                        {lane?.label ?? t[node.projection.kind]} · {graph.historical ? t.history : t.scope}{' '}
                        {graph.round.sequence}
                    </DialogDescription>
                </DialogHeader>
                <Tabs defaultValue="overview" className="min-h-0 overflow-hidden">
                    <div className="shrink-0 overflow-x-auto">
                        <TabsList aria-label={t.nodeDetailsTabs}>
                            {[
                                { key: 'overview', label: t.overview },
                                { key: 'attempts', label: t.attempts, count: attempts.length },
                                { key: 'evidence', label: t.evidence, count: node.projection.evidence.length }
                            ].map((tab) => (
                                <TabsTrigger key={tab.key} value={tab.key}>
                                    {tab.label}
                                    {tab.count !== undefined && <Badge variant="secondary">{tab.count}</Badge>}
                                </TabsTrigger>
                            ))}
                        </TabsList>
                    </div>
                    <div className="min-h-0 overflow-y-auto overscroll-contain">
                        <TabsContent value="overview" forceMount className="space-y-5 data-[state=inactive]:hidden">
                            <section aria-label={t.basicInformation}>
                                <h3 className="mb-4 text-sm font-semibold">{t.basicInformation}</h3>
                                <dl className="grid grid-cols-2 gap-x-6 gap-y-5 text-sm sm:gap-x-10">
                                    {(['lifecycle', 'runtime', 'readiness', 'applicability'] as const).map((key) => (
                                        <div key={key} className="min-w-0 even:border-l even:pl-6 sm:even:pl-8">
                                            <dt className="mb-1.5 text-xs text-muted-foreground">{t[key]}</dt>
                                            <dd className="break-words">{t[node.projection.state[key]]}</dd>
                                        </div>
                                    ))}
                                </dl>
                            </section>
                            <NodePresentation node={node} locale={locale} t={t} />
                            <PipelineAttention
                                key={`attention:${node.id}`}
                                graph={graph}
                                node={node}
                                t={t}
                                reload={reload}
                            />
                            <PipelineLifecycle graph={graph} nodeId={node.id} t={t} reload={reload} />
                            {graph.instance.authority === 'provider' && !graph.historical && (
                                <ProviderActions
                                    key={`actions:${node.id}`}
                                    graph={graph}
                                    node={node}
                                    locale={locale}
                                    t={t}
                                    reload={reload}
                                />
                            )}
                            <section className="border-t pt-5" aria-label={t.relatedTasks}>
                                <h3 className="mb-3 text-sm font-semibold">{t.relatedTasks}</h3>
                                {!tasks.length && <p className="text-sm text-muted-foreground">{t.noTasks}</p>}
                                <div className="space-y-2">
                                    {tasks.map((task) => (
                                        <div
                                            key={task.id}
                                            className="flex items-center gap-3 rounded-lg border px-3 py-3 text-sm"
                                        >
                                            <FileText className="size-4 shrink-0 text-muted-foreground" />
                                            <span className="min-w-0 flex-1 break-words">{task.title}</span>
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                className="shrink-0"
                                                onClick={() => {
                                                    close()
                                                    onTask(task, { ...graph.tasks, canEditPlan: false })
                                                }}
                                            >
                                                {t.openTask}
                                                <ExternalLink />
                                            </Button>
                                        </div>
                                    ))}
                                </div>
                            </section>
                            <Accordion type="single" collapsible>
                                <AccordionItem value="technical">
                                    <AccordionTrigger>{t.versionTechnical}</AccordionTrigger>
                                    <AccordionContent className="space-y-3">
                                        <dl className="grid grid-cols-2 gap-3">
                                            <div>
                                                <dt className="text-xs text-muted-foreground">{t.freshness}</dt>
                                                <dd>{t[node.projection.state.freshness]}</dd>
                                            </div>
                                            <div>
                                                <dt className="text-xs text-muted-foreground">{t.details}</dt>
                                                <dd>{t[node.projection.kind]}</dd>
                                            </div>
                                        </dl>
                                        {!graph.historical &&
                                            graph.instance.authority === 'provider' &&
                                            node.projection.presentation && (
                                                <NodeDiagnostics
                                                    key={`diagnostics:${node.id}`}
                                                    graph={graph}
                                                    node={node}
                                                    t={t}
                                                />
                                            )}
                                    </AccordionContent>
                                </AccordionItem>
                            </Accordion>
                        </TabsContent>
                        <TabsContent value="attempts" forceMount className="space-y-3 data-[state=inactive]:hidden">
                            {!attempts.length && (
                                <p className="py-12 text-center text-sm text-muted-foreground">{t.noAttempts}</p>
                            )}
                            {attempts.map((attempt) => {
                                const summary = executionSummary(attempt, taskTexts),
                                    times = attemptTimes(attempt)
                                return (
                                    <article key={attempt.id} className="space-y-3 rounded-lg border p-4 text-sm">
                                        <div className="flex items-start justify-between gap-3">
                                            <div className="min-w-0 space-y-1">
                                                <p className="break-words font-medium">
                                                    {tasks.find((task) => task.id === attempt.taskId)?.title ??
                                                        node.projection.title}{' '}
                                                    · #{attempt.attempt}
                                                </p>
                                                <p
                                                    className={
                                                        summary.failed ? 'text-destructive' : 'text-muted-foreground'
                                                    }
                                                >
                                                    {summary.label}
                                                    {summary.businessResult
                                                        ? ` · ${taskTexts.outcome}: ${summary.businessResult}`
                                                        : ''}
                                                </p>
                                            </div>
                                            <Button
                                                variant="outline"
                                                size="sm"
                                                className="shrink-0"
                                                disabled={!attempt.invocationId && !attempt.agentExecutionId}
                                                onClick={() =>
                                                    void openTaskExecution(attempt.id, t.navigationError).catch(() =>
                                                        setError(t.navigationError)
                                                    )
                                                }
                                            >
                                                {t.openExecution}
                                            </Button>
                                        </div>
                                        <dl className="grid grid-cols-2 gap-3">
                                            <div>
                                                <dt className="text-xs text-muted-foreground">{t.executionStart}</dt>
                                                <dd className="mt-1">{dateTime(times.start, locale)}</dd>
                                            </div>
                                            <div>
                                                <dt className="text-xs text-muted-foreground">
                                                    {isRunning(attempt) && !times.end
                                                        ? t.executionElapsed
                                                        : t.executionDuration}
                                                </dt>
                                                <dd className="mt-1 tabular-nums">
                                                    {formatExecutionDuration(
                                                        executionDuration(attempt, observedAt),
                                                        locale
                                                    )}
                                                </dd>
                                            </div>
                                        </dl>
                                    </article>
                                )
                            })}
                        </TabsContent>
                        <TabsContent value="evidence" forceMount className="data-[state=inactive]:hidden">
                            <PipelineEvidence
                                key={`evidence:${node.id}:${JSON.stringify(node.projection.evidence)}`}
                                references={node.projection.evidence}
                                t={t}
                            />
                        </TabsContent>
                    </div>
                </Tabs>
                <div className="shrink-0">
                    {error && (
                        <p role="alert" className="mb-3 text-sm text-destructive">
                            {error}
                        </p>
                    )}
                    <DialogFooter>
                        <DialogClose asChild>
                            <Button variant="outline">{t.close}</Button>
                        </DialogClose>
                        {projectId &&
                            !graph.historical &&
                            node.projection.navigation?.kind === 'project_application' && (
                                <PipelineNodeEntry
                                    key={`entry:${node.id}`}
                                    projectId={projectId}
                                    nodeId={node.id}
                                    t={t}
                                />
                            )}
                    </DialogFooter>
                </div>
            </DialogContent>
        </Dialog>
    )
}
