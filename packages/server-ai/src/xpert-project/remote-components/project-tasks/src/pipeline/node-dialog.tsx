import { pipelineExecutions } from './executions'
import { executionSummary, executionDuration, formatExecutionDuration } from '../execution-summary'
import { attemptTimes, isRunning } from '../model'
import { texts, dateTime } from '../i18n'
import { useState } from 'react'
import { X, FileText, ExternalLink, ChevronRight } from 'lucide-react'
import {
    Button,
    Dialog,
    DialogContent,
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
            <DialogContent
                className="flex h-[min(43rem,90dvh)] flex-col gap-0 overflow-hidden p-0 sm:max-w-2xl"
                showCloseButton={false}
            >
                <header className="shrink-0 px-6 pb-5 pt-6 sm:px-7">
                    <div className="flex items-start justify-between gap-4">
                        <DialogTitle className="min-w-0 break-words text-xl font-semibold leading-7">
                            {node.projection.title}
                        </DialogTitle>
                        <Button
                            variant="ghost"
                            size="icon"
                            className="-mr-2 -mt-1 shrink-0"
                            aria-label={t.close}
                            onClick={close}
                        >
                            <X />
                        </Button>
                    </div>
                    <DialogDescription className="mt-1">
                        {lane?.label ?? t[node.projection.kind]} · {graph.historical ? t.history : t.scope}{' '}
                        {graph.round.sequence}
                    </DialogDescription>
                </header>
                <Tabs defaultValue="overview" className="min-h-0 flex-1 gap-0 overflow-hidden">
                    <div className="shrink-0 px-6 sm:px-7">
                        <TabsList
                            variant="line"
                            className="h-11 w-full justify-start gap-5 border-b p-0"
                            aria-label={t.nodeDetailsTabs}
                        >
                            {[
                                { key: 'overview', label: t.overview },
                                { key: 'attempts', label: t.attempts, count: attempts.length },
                                { key: 'evidence', label: t.evidence, count: node.projection.evidence.length }
                            ].map((tab) => (
                                <TabsTrigger
                                    key={tab.key}
                                    value={tab.key}
                                    className="h-full flex-none rounded-none px-1 pb-3 data-[state=active]:text-primary after:bottom-0 after:bg-primary"
                                >
                                    {tab.label}
                                    {tab.count !== undefined && (
                                        <span className="rounded-md bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">
                                            {tab.count}
                                        </span>
                                    )}
                                </TabsTrigger>
                            ))}
                        </TabsList>
                    </div>
                    <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-6 py-6 sm:px-7">
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
                                                className="shrink-0 text-primary"
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
                            <details className="group border-t pt-4 text-sm">
                                <summary className="flex cursor-pointer list-none items-center gap-2 rounded-sm font-medium focus-visible:outline focus-visible:outline-ring">
                                    <ChevronRight className="size-4 group-open:rotate-90" />
                                    {t.versionTechnical}
                                </summary>
                                <div className="mt-4 space-y-3">
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
                                </div>
                            </details>
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
                <footer className="shrink-0 border-t px-6 py-4 sm:px-7">
                    {error && (
                        <p role="alert" className="mb-3 text-sm text-destructive">
                            {error}
                        </p>
                    )}
                    <div className="flex flex-wrap items-start justify-end gap-3">
                        <Button variant="outline" onClick={close}>
                            {t.close}
                        </Button>
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
                    </div>
                </footer>
            </DialogContent>
        </Dialog>
    )
}
