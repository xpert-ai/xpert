import { useEffect, useState, type MutableRefObject } from 'react'
import { z } from 'zod'
import { Bot, ExternalLink, Info, GitBranch, ChevronRight, FileText } from 'lucide-react'
import {
    Button,
    Input,
    Label,
    Tabs,
    TabsList,
    TabsTrigger,
    TabsContent,
    DropdownMenu,
    DropdownMenuTrigger,
    DropdownMenuContent,
    DropdownMenuCheckboxItem,
    buttonVariants
} from '@xpert-ai/shadcn-ui'
import { forecastProjectTasks } from '@xpert-ai/contracts'
import { graphSchema, request, type Graph, type Node } from './bridge'
import { type Texts, dateTime, runtimeLabel, outcomeLabel } from './i18n'
import { type Attempt, attemptTimes, owner } from './model'
import { Status, Choice, Empty } from './ui'
import { openTaskExecution } from './execution-navigation'
import { TaskTypeIcon } from './task-type-icon'

function toLocal(value: string | null) {
    if (!value) return ''
    const date = new Date(value)
    return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16)
}
/** Transient draft owned by the view so changing between inspector and Sheet never loses input. */
export interface DetailDraft {
    taskId: string
    tab: string
    dirty: boolean
    revision: number
    start: string
    minutes: string
    parent: string
    dependencies: string[]
}
export function TaskDetail({
    graph,
    task,
    t,
    locale,
    select,
    onGraph,
    onDirty,
    draftRef
}: {
    graph: Graph
    task: Node
    t: Texts
    locale: string
    select: (task: Node) => void
    onGraph: (graph: Graph) => void
    onDirty: (dirty: boolean) => void
    draftRef: MutableRefObject<DetailDraft | null>
}) {
    const cached = draftRef.current?.taskId === task.id ? draftRef.current : null
    const attempts = graph.executions.filter((item) => item.taskId === task.id).sort((a, b) => b.attempt - a.attempt)
    const [tab, setTab] = useState(cached?.tab ?? (attempts.length ? 'history' : 'overview'))
    const [busy, setBusy] = useState<string | null>(null),
        [error, setError] = useState<string | null>(null)
    const [saved, setSaved] = useState(false),
        [dirty, setDirty] = useState(cached?.dirty ?? false)
    const [revision, setRevision] = useState(cached?.revision ?? task.revision),
        [start, setStart] = useState(cached?.start ?? toLocal(task.plannedStartAt))
    const duration =
        task.estimatedDurationMs ??
        (task.plannedStartAt && task.plannedEndAt
            ? Date.parse(task.plannedEndAt) - Date.parse(task.plannedStartAt)
            : null)
    const [minutes, setMinutes] = useState(cached?.minutes ?? (duration == null ? '' : String(duration / 60000)))
    const [parent, setParent] = useState(cached?.parent ?? task.parentTaskId ?? 'none'),
        [dependencies, setDependencies] = useState(cached?.dependencies ?? task.predecessorIds)
    const [impact, setImpact] = useState<Array<{ id: string; end: string | null }> | null>(null)
    const canEdit = graph.canEditPlan === true
    useEffect(() => {
        onDirty(dirty)
    }, [dirty, onDirty])
    useEffect(() => {
        draftRef.current = { taskId: task.id, tab, dirty, revision, start, minutes, parent, dependencies }
    }, [draftRef, task.id, tab, dirty, revision, start, minutes, parent, dependencies])
    const edit = () => {
        setDirty(true)
        setSaved(false)
        setImpact(null)
    }
    const reload = () => {
        setRevision(task.revision)
        setStart(toLocal(task.plannedStartAt))
        setMinutes(duration == null ? '' : String(duration / 60000))
        setParent(task.parentTaskId ?? 'none')
        setDependencies(task.predecessorIds)
        setDirty(false)
        setImpact(null)
        setError(null)
    }
    const patch = () => {
        if (revision !== task.revision) throw Error(t.conflict)
        const ms = minutes.trim() === '' ? null : Number(minutes) * 60000
        if ((ms != null && (!Number.isFinite(ms) || ms < 0)) || (start && !Number.isFinite(Date.parse(start))))
            throw Error(t.invalid)
        return {
            taskId: task.id,
            expectedRevision: revision,
            plannedStartAt: start ? new Date(start).toISOString() : null,
            plannedEndAt: start && ms != null ? new Date(Date.parse(start) + ms).toISOString() : null,
            estimatedDurationMs: ms,
            ...(!task.providerKey
                ? { parentTaskId: parent === 'none' ? null : parent, predecessorIds: dependencies }
                : {})
        }
    }
    const act = async (key: string, operation: () => Promise<void> | void) => {
        setBusy(key)
        setError(null)
        try {
            await operation()
        } catch (error) {
            setError(error instanceof Error ? error.message : t.error)
        } finally {
            setBusy(null)
        }
    }
    const open = (attempt: Attempt) => void act(attempt.id, () => openTaskExecution(attempt.id, t.openFailed))
    const openButton = (attempt: Attempt, primary: boolean) => (
        <Button
            variant={primary ? 'default' : 'outline'}
            size="sm"
            className="w-full"
            disabled={!attempt.agentExecutionId || !!busy}
            title={!attempt.agentExecutionId ? t.unavailable : undefined}
            onClick={() => open(attempt)}
        >
            <ExternalLink />
            {busy === attempt.id ? t.saving : t.open}
        </Button>
    )
    return (
        <div className="flex h-full min-h-0 flex-col">
            <div className="space-y-2 px-4 pb-3 pt-1">
                <h2 className="flex items-start gap-2 text-lg font-semibold leading-6">
                    <TaskTypeIcon task={task} locale={locale} fallbackLabel={t[task.kind]} />
                    <span className="min-w-0 break-words">{task.title}</span>
                </h2>
                <div className="flex items-center gap-3">
                    <Status value={task.status} t={t} />
                    <span className="text-xs text-muted-foreground">
                        {t[task.kind]} · {t.revision} {task.revision}
                    </span>
                </div>
            </div>
            <Tabs value={tab} onValueChange={setTab} className="min-h-0 flex-1 gap-0">
                <TabsList variant="line" aria-label={t.detailLabel} className="w-full justify-start border-b px-4">
                    {(['overview', 'history', 'outputs'] as const).map((value) => (
                        <TabsTrigger
                            key={value}
                            value={value}
                            className="data-[state=active]:text-primary data-[state=active]:after:bg-primary"
                        >
                            {t[value]}
                            {value === 'history' && attempts.length > 0 && (
                                <span className="text-xs">{attempts.length}</span>
                            )}
                        </TabsTrigger>
                    ))}
                </TabsList>
                <TabsContent value={tab} className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4">
                    {error && (
                        <p
                            role="alert"
                            className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive"
                        >
                            {error}
                        </p>
                    )}
                    <div className="space-y-2 text-xs">
                        <div className="flex items-center gap-3">
                            <span className="w-20 shrink-0 text-muted-foreground">{t.assignee}</span>
                            <Bot className="size-4 shrink-0 text-muted-foreground" />
                            <span className="min-w-0 break-words">{owner(task, t.unassigned, t.unnamedAssistant)}</span>
                        </div>
                        <div className="flex items-start gap-3">
                            <span className="w-20 shrink-0 pt-1 text-muted-foreground">{t.predecessors}</span>
                            <div className="min-w-0 flex-1">
                                {task.predecessorIds.length ? (
                                    task.predecessorIds.map((id) => {
                                        const item = graph.tasks.find((task) => task.id === id)
                                        return item ? (
                                            <button
                                                key={id}
                                                onClick={() => select(item)}
                                                className="flex w-full items-center gap-2 rounded py-1 text-left hover:text-primary"
                                            >
                                                <GitBranch className="size-3.5 shrink-0" />
                                                <span className="flex-1 truncate" title={item.title}>
                                                    {item.title}
                                                </span>
                                                <ChevronRight className="size-3.5" />
                                            </button>
                                        ) : null
                                    })
                                ) : (
                                    <span className="leading-6 text-muted-foreground">{t.noDependencies}</span>
                                )}
                            </div>
                        </div>
                    </div>
                    {task.diagnostic && (
                        <p className="rounded-md bg-destructive/5 p-3 text-sm text-destructive">{task.diagnostic}</p>
                    )}
                    {tab === 'history' && (
                        <div className="space-y-3 border-t pt-3">
                            {!attempts.length && <Empty title={t.noExecutions} />}
                            {attempts.map((attempt, index) => {
                                const times = attemptTimes(attempt)
                                return (
                                    <section
                                        key={attempt.id}
                                        className="space-y-2 rounded-lg border p-3"
                                        aria-label={`${t.attempt} ${attempt.attempt} ${t.execution}`}
                                    >
                                        <div className="flex flex-wrap items-center justify-between gap-2">
                                            <h3 className="text-sm font-semibold">
                                                {t.attempt} {attempt.attempt} {t.execution}
                                            </h3>
                                            <span className="text-xs text-muted-foreground">
                                                {runtimeLabel(attempt.runtimeStatus, t)}
                                            </span>
                                        </div>
                                        <p className="text-xs tabular-nums text-muted-foreground">
                                            {dateTime(times.start, locale)} → {dateTime(times.end, locale)}
                                        </p>
                                        {attempt.outputSummary && (
                                            <p className="text-sm leading-6">
                                                <span className="text-muted-foreground">{t.outcome}: </span>
                                                {outcomeLabel(attempt.outputSummary, t)}
                                            </p>
                                        )}
                                        {attempt.error && (
                                            <p className="break-words text-sm leading-6 text-destructive">
                                                {attempt.error}
                                            </p>
                                        )}
                                        {openButton(attempt, index === 0)}
                                    </section>
                                )
                            })}
                            {!!attempts.length && (
                                <p className="flex items-start gap-2 text-xs leading-5 text-muted-foreground">
                                    <Info className="mt-0.5 size-4 shrink-0" />
                                    {t.independent}
                                </p>
                            )}
                        </div>
                    )}
                    {tab === 'outputs' && (
                        <div className="space-y-4 border-t pt-4">
                            <p className="text-xs leading-5 text-muted-foreground">{t.outputsHint}</p>
                            {!attempts.some((item) => item.outputSummary) && <Empty title={t.noOutputs} />}
                            {attempts
                                .filter((item) => item.outputSummary)
                                .map((attempt) => (
                                    <section key={attempt.id} className="space-y-3 rounded-lg border p-4">
                                        <h3 className="flex items-center gap-2 text-sm font-semibold">
                                            <FileText className="size-4" />
                                            {t.attempt} {attempt.attempt} {t.execution}
                                        </h3>
                                        <p className="whitespace-pre-wrap break-words text-sm leading-6">
                                            {outcomeLabel(attempt.outputSummary, t)}
                                        </p>
                                        {openButton(attempt, false)}
                                    </section>
                                ))}
                        </div>
                    )}
                    {tab === 'overview' && (
                        <div className="space-y-4 border-t pt-4">
                            {revision !== task.revision && (
                                <div role="status" className="space-y-2 rounded-md bg-muted p-3 text-sm">
                                    <p>{t.conflict}</p>
                                    <Button variant="outline" size="sm" onClick={reload}>
                                        {t.reload}
                                    </Button>
                                </div>
                            )}
                            <div className="space-y-2">
                                <Label htmlFor="plan-start">{t.start}</Label>
                                <Input
                                    id="plan-start"
                                    type="datetime-local"
                                    disabled={!canEdit}
                                    value={start}
                                    onChange={(event) => {
                                        edit()
                                        setStart(event.target.value)
                                    }}
                                />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="plan-duration">{t.duration}</Label>
                                <Input
                                    id="plan-duration"
                                    type="number"
                                    min="0"
                                    disabled={!canEdit}
                                    value={minutes}
                                    onChange={(event) => {
                                        edit()
                                        setMinutes(event.target.value)
                                    }}
                                />
                            </div>
                            <div className="space-y-2">
                                <Label>{t.parent}</Label>
                                <Choice
                                    label={t.parent}
                                    value={parent}
                                    className="w-full"
                                    disabled={!canEdit || !!task.providerKey}
                                    options={[
                                        { value: 'none', label: t.noParent },
                                        ...graph.tasks
                                            .filter((item) => item.id !== task.id)
                                            .map((item) => ({ value: item.id, label: item.title }))
                                    ]}
                                    onChange={(value) => {
                                        edit()
                                        setParent(value)
                                    }}
                                />
                            </div>
                            <div className="space-y-2">
                                <Label>{t.predecessors}</Label>
                                <DropdownMenu>
                                    <DropdownMenuTrigger
                                        disabled={!canEdit || !!task.providerKey}
                                        className={buttonVariants({ variant: 'outline' })}
                                    >
                                        {t.predecessors} · {dependencies.length}
                                    </DropdownMenuTrigger>
                                    <DropdownMenuContent className="max-h-72 max-w-80 overflow-y-auto">
                                        {graph.tasks
                                            .filter((item) => item.id !== task.id)
                                            .map((item) => (
                                                <DropdownMenuCheckboxItem
                                                    key={item.id}
                                                    checked={dependencies.includes(item.id)}
                                                    onSelect={(event) => event.preventDefault()}
                                                    onCheckedChange={(checked) => {
                                                        edit()
                                                        setDependencies(
                                                            checked
                                                                ? [...dependencies, item.id]
                                                                : dependencies.filter((id) => id !== item.id)
                                                        )
                                                    }}
                                                >
                                                    {item.title}
                                                </DropdownMenuCheckboxItem>
                                            ))}
                                    </DropdownMenuContent>
                                </DropdownMenu>
                            </div>
                            {task.providerKey && <p className="text-xs leading-5 text-muted-foreground">{t.managed}</p>}
                            {canEdit && (
                                <>
                                    <p className="text-xs leading-5 text-muted-foreground">{t.planNote}</p>
                                    <div className="flex flex-wrap gap-2">
                                        <Button
                                            variant="outline"
                                            disabled={!!busy}
                                            onClick={() =>
                                                void act('preview', () => {
                                                    const draft = patch()
                                                    setImpact(
                                                        forecastProjectTasks(
                                                            graph.tasks.map((item) =>
                                                                item.id === task.id ? { ...item, ...draft } : item
                                                            ),
                                                            task.id
                                                        )
                                                            .filter((item) => item.affected && item.taskId !== task.id)
                                                            .map((item) => ({ id: item.taskId, end: item.endAt }))
                                                    )
                                                })
                                            }
                                        >
                                            {t.preview}
                                        </Button>
                                        <Button
                                            disabled={!!busy || !dirty}
                                            onClick={() =>
                                                void act('save', async () => {
                                                    const result = z
                                                        .object({ success: z.literal(true), data: graphSchema })
                                                        .parse(
                                                            await request('executeAction', {
                                                                actionKey: 'change',
                                                                input: patch()
                                                            })
                                                        )
                                                    onGraph(result.data)
                                                    const updated = result.data.tasks.find(
                                                        (item) => item.id === task.id
                                                    )
                                                    if (updated) setRevision(updated.revision)
                                                    setDirty(false)
                                                    setSaved(true)
                                                })
                                            }
                                        >
                                            {busy === 'save' ? t.saving : t.save}
                                        </Button>
                                    </div>
                                </>
                            )}
                            {saved && (
                                <p role="status" className="text-sm text-[var(--success)]">
                                    {t.saved}
                                </p>
                            )}
                            {dirty && <p className="text-xs text-muted-foreground">{t.unsaved}</p>}
                            {impact && (
                                <div className="space-y-2 rounded-md bg-muted/50 p-3">
                                    <h3 className="text-sm font-semibold">{t.impacted}</h3>
                                    {impact.length ? (
                                        impact.map((item) => (
                                            <p key={item.id} className="text-xs leading-5">
                                                {graph.tasks.find((task) => task.id === item.id)?.title} →{' '}
                                                {dateTime(item.end, locale)}
                                            </p>
                                        ))
                                    ) : (
                                        <p className="text-xs text-muted-foreground">{t.noImpact}</p>
                                    )}
                                </div>
                            )}
                        </div>
                    )}
                </TabsContent>
            </Tabs>
        </div>
    )
}
