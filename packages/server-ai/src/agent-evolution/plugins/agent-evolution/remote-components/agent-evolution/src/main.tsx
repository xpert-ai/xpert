import * as React from 'react'
import { createRoot } from 'react-dom/client'
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
    AlertDialogTrigger,
    Badge,
    Button,
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
    Progress,
    ScrollArea,
    Separator,
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
    Tabs,
    TabsContent,
    TabsList,
    TabsTrigger,
    installShadcnThemeVars
} from '@xpert-ai/shadcn-ui'
import {
    Activity,
    ArrowRight,
    Beaker,
    BookOpenCheck,
    CheckCircle2,
    CircleGauge,
    GitCompareArrows,
    History,
    PlayCircle,
    RefreshCw,
    Rocket,
    ShieldCheck,
    Sparkles,
    Target,
    TriangleAlert
} from 'lucide-react'
import {
    applyTheme,
    isInitMessage,
    notify,
    requestData,
    resolveHostResponse,
    runSimulation,
    setInstanceId
} from './bridge'
import { formatDate, formatNumber, setLocale, statusLabel, t } from './i18n'
import type { EvolutionDashboard, EvolutionTab } from './types'

const EMPTY_DASHBOARD: EvolutionDashboard = {
    targets: [],
    events: [],
    proposals: [],
    candidates: [],
    evaluations: [],
    releases: [],
    deployments: [],
    pointers: [],
    audits: []
}

function App() {
    const [ready, setReady] = React.useState(false)
    const [loading, setLoading] = React.useState(false)
    const [running, setRunning] = React.useState(false)
    const [tab, setTab] = React.useState<EvolutionTab>('overview')
    const [dashboard, setDashboard] = React.useState<EvolutionDashboard>(EMPTY_DASHBOARD)
    const [error, setError] = React.useState<string | null>(null)

    const load = React.useCallback(async () => {
        if (!ready) return
        setLoading(true)
        setError(null)
        try {
            const data = await requestData()
            setDashboard(data.summary ?? EMPTY_DASHBOARD)
        } catch (loadError) {
            setError(readError(loadError, t('error.load')))
        } finally {
            setLoading(false)
        }
    }, [ready])

    React.useEffect(() => {
        const onMessage = (event: MessageEvent) => {
            if (resolveHostResponse(event.data)) return
            if (!isInitMessage(event.data)) return
            setInstanceId(event.data.instanceId)
            applyTheme(event.data.theme)
            installShadcnThemeVars()
            setLocale(event.data.locale)
            if (isEvolutionTab(event.data.parameters?.tab)) setTab(event.data.parameters.tab)
            setReady(true)
        }
        window.addEventListener('message', onMessage)
        window.parent?.postMessage({ channel: 'xpertai.remote_component', protocolVersion: 1, type: 'ready' }, '*')
        return () => window.removeEventListener('message', onMessage)
    }, [])

    React.useEffect(() => {
        void load()
    }, [load])

    const simulate = React.useCallback(async () => {
        setRunning(true)
        setError(null)
        try {
            const result = await runSimulation()
            if (!result.success || !result.data) throw new Error(t('error.run'))
            notify(
                t('simulation.complete', {
                    id: result.data.simulationId,
                    version: result.data.activeVersionId
                }),
                'success'
            )
            await load()
            setTab('release')
        } catch (runError) {
            const message = readError(runError, t('error.run'))
            setError(message)
            notify(message, 'error')
        } finally {
            setRunning(false)
        }
    }, [load])

    return (
        <main className="flex h-full min-h-0 flex-col bg-background text-foreground" data-testid="evolution-center">
            <header className="flex shrink-0 items-center justify-between border-b px-6 py-5">
                <div>
                    <div className="flex items-center gap-2">
                        <Sparkles className="size-5 text-primary" aria-hidden="true" />
                        <h1 className="text-2xl font-semibold tracking-tight">{t('app.title')}</h1>
                    </div>
                    <p className="mt-1 text-sm text-muted-foreground">{t('app.subtitle')}</p>
                </div>
                <div className="flex items-center gap-2">
                    <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading || running}>
                        <RefreshCw className={loading ? 'size-4 animate-spin' : 'size-4'} aria-hidden="true" />
                        {t('actions.refresh')}
                    </Button>
                    <SimulationDialog running={running} onConfirm={simulate} />
                </div>
            </header>

            {error ? (
                <div className="mx-6 mt-4 flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
                    <TriangleAlert className="size-4" aria-hidden="true" />
                    {error}
                </div>
            ) : null}

            <Tabs
                value={tab}
                onValueChange={(value) => isEvolutionTab(value) && setTab(value)}
                className="min-h-0 flex-1"
            >
                <TabsList className="mx-6 mt-3 h-auto justify-start rounded-none border-b bg-transparent p-0">
                    <TabTrigger value="overview" icon={CircleGauge} label={t('tabs.overview')} />
                    <TabTrigger value="learning" icon={BookOpenCheck} label={t('tabs.learning')} />
                    <TabTrigger value="evaluation" icon={Beaker} label={t('tabs.evaluation')} />
                    <TabTrigger value="release" icon={Rocket} label={t('tabs.release')} />
                </TabsList>
                <ScrollArea className="h-[calc(100%-3.5rem)]">
                    <div className="p-6">
                        {!dashboard.events.length ? (
                            <EmptyState running={running} onRun={simulate} />
                        ) : (
                            <>
                                <TabsContent value="overview" className="m-0">
                                    <Overview dashboard={dashboard} />
                                </TabsContent>
                                <TabsContent value="learning" className="m-0">
                                    <Learning dashboard={dashboard} />
                                </TabsContent>
                                <TabsContent value="evaluation" className="m-0">
                                    <Evaluation dashboard={dashboard} />
                                </TabsContent>
                                <TabsContent value="release" className="m-0">
                                    <Release dashboard={dashboard} />
                                </TabsContent>
                            </>
                        )}
                    </div>
                </ScrollArea>
            </Tabs>
        </main>
    )
}

function SimulationDialog({
    running,
    onConfirm,
    testId
}: {
    running: boolean
    onConfirm: () => Promise<void>
    testId?: string
}) {
    return (
        <AlertDialog>
            <AlertDialogTrigger asChild>
                <Button size="sm" disabled={running} data-testid={testId}>
                    <PlayCircle className="size-4" aria-hidden="true" />
                    {running ? t('actions.running') : t('actions.run')}
                </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
                <AlertDialogHeader>
                    <AlertDialogTitle>{t('confirm.title')}</AlertDialogTitle>
                    <AlertDialogDescription>{t('confirm.description')}</AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                    <AlertDialogCancel>{t('actions.cancel')}</AlertDialogCancel>
                    <AlertDialogAction onClick={() => void onConfirm()}>{t('actions.run')}</AlertDialogAction>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>
    )
}

function TabTrigger({ value, icon: Icon, label }: { value: EvolutionTab; icon: React.ElementType; label: string }) {
    return (
        <TabsTrigger
            value={value}
            className="gap-2 rounded-none border-b-2 border-transparent px-4 py-3 data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none"
        >
            <Icon className="size-4" aria-hidden="true" />
            {label}
        </TabsTrigger>
    )
}

function EmptyState({ running, onRun }: { running: boolean; onRun: () => Promise<void> }) {
    return (
        <Card className="mx-auto mt-16 max-w-xl border-dashed text-center">
            <CardHeader className="items-center">
                <div className="mb-2 grid size-14 place-items-center rounded-2xl bg-primary/10 text-primary">
                    <GitCompareArrows className="size-7" aria-hidden="true" />
                </div>
                <CardTitle>{t('empty.title')}</CardTitle>
                <CardDescription className="max-w-md">{t('empty.description')}</CardDescription>
            </CardHeader>
            <CardContent>
                <SimulationDialog running={running} onConfirm={onRun} testId="empty-run-simulation" />
            </CardContent>
        </Card>
    )
}

function Overview({ dashboard }: { dashboard: EvolutionDashboard }) {
    const activeReleases = dashboard.releases.filter((release) => release.status === 'active').length
    const pipeline = [
        [t('pipeline.events'), dashboard.events.length, BookOpenCheck],
        [t('pipeline.proposal'), dashboard.proposals.length, Sparkles],
        [t('pipeline.candidate'), dashboard.candidates.length, Beaker],
        [t('pipeline.evaluation'), dashboard.evaluations.length, GitCompareArrows],
        [t('pipeline.release'), dashboard.releases.length, ShieldCheck],
        [t('pipeline.production'), dashboard.pointers.length, Rocket]
    ] as const
    return (
        <div className="space-y-6">
            <Card className="border-primary/20 bg-primary/5">
                <CardContent className="flex items-center justify-between py-5">
                    <div className="flex items-center gap-3">
                        <CheckCircle2 className="size-6 text-primary" aria-hidden="true" />
                        <div>
                            <div className="font-semibold">{t('health.normal')}</div>
                            <div className="text-sm text-muted-foreground">{t('health.detail')}</div>
                        </div>
                    </div>
                    <StatusBadge status="active" />
                </CardContent>
            </Card>
            <div className="grid gap-4 md:grid-cols-4">
                <MetricCard label={t('metric.targets')} value={dashboard.targets.length} icon={Target} />
                <MetricCard label={t('metric.events')} value={dashboard.events.length} icon={Activity} />
                <MetricCard label={t('metric.candidates')} value={dashboard.candidates.length} icon={Beaker} />
                <MetricCard label={t('metric.active')} value={activeReleases} icon={Rocket} />
            </div>
            <Section title={t('section.pipeline')}>
                <div className="grid gap-2 lg:grid-cols-6">
                    {pipeline.map(([label, count, Icon], index) => (
                        <React.Fragment key={label}>
                            <div className="relative rounded-lg border bg-card p-4">
                                <Icon className="mb-3 size-5 text-primary" aria-hidden="true" />
                                <div className="text-2xl font-semibold">{count}</div>
                                <div className="text-xs text-muted-foreground">{label}</div>
                                {index < pipeline.length - 1 ? (
                                    <ArrowRight
                                        className="absolute -right-3 top-1/2 z-10 hidden size-5 -translate-y-1/2 rounded-full bg-background text-muted-foreground lg:block"
                                        aria-hidden="true"
                                    />
                                ) : null}
                            </div>
                        </React.Fragment>
                    ))}
                </div>
            </Section>
            <Section title={t('section.targets')}>
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>{t('table.target')}</TableHead>
                            <TableHead>{t('table.status')}</TableHead>
                            <TableHead>{t('table.version')}</TableHead>
                            <TableHead>{t('table.evidence')}</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {dashboard.targets.map((target) => {
                            const pointer = dashboard.pointers.find((item) => item.targetId === target.targetId)
                            return (
                                <TableRow key={target.targetId}>
                                    <TableCell>
                                        <div className="font-medium">{target.displayName}</div>
                                        <div className="font-mono text-xs text-muted-foreground">{target.targetId}</div>
                                    </TableCell>
                                    <TableCell>
                                        <StatusBadge status={target.status} />
                                    </TableCell>
                                    <TableCell className="font-mono text-xs">
                                        {pointer?.activeVersionId ?? '—'}
                                    </TableCell>
                                    <TableCell>{target.metricSetId}</TableCell>
                                </TableRow>
                            )
                        })}
                    </TableBody>
                </Table>
            </Section>
        </div>
    )
}

function Learning({ dashboard }: { dashboard: EvolutionDashboard }) {
    return (
        <div className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
            <Section title={t('section.signals')}>
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>{t('table.id')}</TableHead>
                            <TableHead>{t('table.target')}</TableHead>
                            <TableHead>{t('table.status')}</TableHead>
                            <TableHead>{t('table.evidence')}</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {dashboard.events.map((event) => (
                            <TableRow key={event.eventId}>
                                <TableCell className="font-mono text-xs">{event.eventId}</TableCell>
                                <TableCell>{event.targetId}</TableCell>
                                <TableCell>
                                    <StatusBadge status={event.eventType} />
                                </TableCell>
                                <TableCell className="max-w-md text-sm">{event.finalOutcomeSummary}</TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
            </Section>
            <Section title={t('section.proposals')}>
                <div className="space-y-4">
                    {dashboard.proposals.map((proposal) => (
                        <Card key={`${proposal.proposalId}:${proposal.revision}`}>
                            <CardHeader>
                                <div className="flex items-center justify-between gap-3">
                                    <CardTitle className="text-base">{proposal.title}</CardTitle>
                                    <StatusBadge status={proposal.status} />
                                </div>
                                <CardDescription>{proposal.problemStatement}</CardDescription>
                            </CardHeader>
                            <CardContent className="space-y-3 text-sm">
                                <p>{proposal.changeHypothesis}</p>
                                <Separator />
                                <div className="flex justify-between text-muted-foreground">
                                    <span>{proposal.proposalId}</span>
                                    <span>{proposal.evidenceEventIds.length} evidence</span>
                                </div>
                            </CardContent>
                        </Card>
                    ))}
                </div>
            </Section>
        </div>
    )
}

function Evaluation({ dashboard }: { dashboard: EvolutionDashboard }) {
    const run = dashboard.evaluations[0]
    if (!run) return null
    const metrics = run.metrics
    return (
        <div className="space-y-6">
            <div className="grid gap-4 md:grid-cols-4">
                <MetricCard
                    label={t('table.baseline')}
                    value={formatPercent(metrics.baselineAccuracy)}
                    icon={CircleGauge}
                />
                <MetricCard
                    label={t('table.candidate')}
                    value={formatPercent(metrics.candidateAccuracy)}
                    icon={Beaker}
                    emphasis
                />
                <MetricCard
                    label="Accuracy Δ"
                    value={`+${formatPercent(metrics.accuracyDelta)}`}
                    icon={Activity}
                    emphasis
                />
                <MetricCard label="P95 latency" value={`${metrics.p95LatencyMs} ms`} icon={History} />
            </div>
            <Card className="border-primary/20 bg-primary/5">
                <CardContent className="flex items-center justify-between py-5">
                    <div>
                        <div className="text-sm text-muted-foreground">{run.runId}</div>
                        <div className="mt-1 text-xl font-semibold">{t('result.promote')}</div>
                    </div>
                    <div className="flex items-center gap-3">
                        <span className="text-sm text-muted-foreground">
                            {metrics.passedCases}/{metrics.totalCases}
                        </span>
                        <StatusBadge status={run.status} />
                    </div>
                </CardContent>
            </Card>
            <Section title={t('section.cases')}>
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>{t('table.id')}</TableHead>
                            <TableHead>{t('table.baseline')}</TableHead>
                            <TableHead>{t('table.candidate')}</TableHead>
                            <TableHead>{t('table.result')}</TableHead>
                            <TableHead>P95</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {run.caseResults.map((result) => (
                            <TableRow key={result.caseId}>
                                <TableCell className="font-mono text-xs">{result.caseId}</TableCell>
                                <TableCell>
                                    {result.baselinePassed ? t('result.correct') : t('result.regression')}
                                </TableCell>
                                <TableCell>
                                    {result.candidatePassed ? t('result.correct') : t('result.regression')}
                                </TableCell>
                                <TableCell>
                                    <StatusBadge status={result.candidatePassed ? 'passed' : 'failed'} />
                                </TableCell>
                                <TableCell>{result.latencyMs} ms</TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
            </Section>
        </div>
    )
}

function Release({ dashboard }: { dashboard: EvolutionDashboard }) {
    const release = dashboard.releases[0]
    const pointer = dashboard.pointers[0]
    return (
        <div className="space-y-6">
            {release ? (
                <Card>
                    <CardHeader>
                        <div className="flex items-center justify-between gap-3">
                            <div>
                                <CardTitle>{release.releasePackageId}</CardTitle>
                                <CardDescription>
                                    {release.candidateId} · {release.targetId}
                                </CardDescription>
                            </div>
                            <StatusBadge status={release.status} />
                        </div>
                    </CardHeader>
                    <CardContent>
                        <div className="grid gap-3 md:grid-cols-5">
                            {['approved', 'installed', 'shadow', 'canary', 'active'].map((status, index) => (
                                <div key={status} className="relative rounded-lg border bg-muted/30 p-3">
                                    <CheckCircle2 className="mb-2 size-5 text-primary" aria-hidden="true" />
                                    <div className="text-sm font-medium">{statusLabel(status)}</div>
                                    {index < 4 ? (
                                        <ArrowRight
                                            className="absolute -right-3 top-1/2 hidden size-5 -translate-y-1/2 rounded-full bg-background text-muted-foreground md:block"
                                            aria-hidden="true"
                                        />
                                    ) : null}
                                </div>
                            ))}
                        </div>
                    </CardContent>
                </Card>
            ) : null}
            <div className="grid gap-6 lg:grid-cols-2">
                <Section title={t('section.deployments')}>
                    <div className="space-y-4">
                        {dashboard.deployments.map((deployment) => (
                            <div key={deployment.deploymentId} className="rounded-lg border p-4">
                                <div className="flex items-center justify-between">
                                    <div>
                                        <div className="font-medium">{statusLabel(deployment.channel)}</div>
                                        <div className="font-mono text-xs text-muted-foreground">
                                            {deployment.deploymentId}
                                        </div>
                                    </div>
                                    <StatusBadge status={deployment.status} />
                                </div>
                                <div className="mt-4 flex items-center gap-3">
                                    <Progress value={deployment.candidateAccuracy * 100} />
                                    <span className="whitespace-nowrap text-sm">
                                        {formatPercent(deployment.candidateAccuracy)}
                                    </span>
                                </div>
                                <div className="mt-2 text-xs text-muted-foreground">
                                    {formatNumber(deployment.sampleCount)} {t('table.samples')}
                                </div>
                            </div>
                        ))}
                    </div>
                </Section>
                <Section title={t('section.pointer')}>
                    {pointer ? (
                        <div className="space-y-4">
                            <div className="rounded-lg border border-primary/20 bg-primary/5 p-5">
                                <div className="flex items-center justify-between">
                                    <span className="text-sm text-muted-foreground">Active Pointer</span>
                                    <StatusBadge status="production" />
                                </div>
                                <div className="mt-3 font-mono text-xl font-semibold">{pointer.activeVersionId}</div>
                                <div className="mt-1 text-sm text-muted-foreground">
                                    {t('pointer.revision', { revision: pointer.revision })}
                                </div>
                            </div>
                            <div className="grid grid-cols-2 gap-3 text-sm">
                                <div className="rounded-lg border p-3">
                                    <div className="text-muted-foreground">Rollback</div>
                                    <div className="mt-1 font-mono text-xs">{pointer.rollbackVersionId ?? '—'}</div>
                                </div>
                                <div className="rounded-lg border p-3">
                                    <div className="text-muted-foreground">Release</div>
                                    <div className="mt-1 font-mono text-xs">{pointer.releasePackageId ?? '—'}</div>
                                </div>
                            </div>
                        </div>
                    ) : null}
                </Section>
            </div>
            <Section title={t('section.audit')}>
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>{t('table.time')}</TableHead>
                            <TableHead>{t('table.action')}</TableHead>
                            <TableHead>{t('table.actor')}</TableHead>
                            <TableHead>{t('table.evidence')}</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {dashboard.audits.map((audit) => (
                            <TableRow key={audit.auditId}>
                                <TableCell className="whitespace-nowrap text-xs">
                                    {formatDate(audit.occurredAt)}
                                </TableCell>
                                <TableCell className="font-mono text-xs">{audit.action}</TableCell>
                                <TableCell>{audit.actorRole}</TableCell>
                                <TableCell>{audit.summary}</TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
            </Section>
        </div>
    )
}

function MetricCard({
    label,
    value,
    icon: Icon,
    emphasis = false
}: {
    label: string
    value: string | number
    icon: React.ElementType
    emphasis?: boolean
}) {
    return (
        <Card className={emphasis ? 'border-primary/30 bg-primary/5' : ''}>
            <CardContent className="flex items-start justify-between p-5">
                <div>
                    <div className="text-sm text-muted-foreground">{label}</div>
                    <div className="mt-2 text-3xl font-semibold tracking-tight">{value}</div>
                </div>
                <div className="rounded-lg bg-muted p-2 text-primary">
                    <Icon className="size-5" aria-hidden="true" />
                </div>
            </CardContent>
        </Card>
    )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
    return (
        <Card>
            <CardHeader className="pb-3">
                <CardTitle className="text-base">{title}</CardTitle>
            </CardHeader>
            <CardContent>{children}</CardContent>
        </Card>
    )
}

function StatusBadge({ status }: { status: string }) {
    const positive = [
        'active',
        'ready',
        'approved',
        'packaged',
        'passed',
        'shadow',
        'canary',
        'production',
        'prediction_reviewed'
    ].includes(status)
    return (
        <Badge variant={positive ? 'secondary' : status === 'failed' ? 'destructive' : 'outline'}>
            {statusLabel(status)}
        </Badge>
    )
}

function formatPercent(value: number) {
    return formatNumber(value, { style: 'percent', maximumFractionDigits: 1 })
}

function isEvolutionTab(value?: string): value is EvolutionTab {
    return value === 'overview' || value === 'learning' || value === 'evaluation' || value === 'release'
}

function readError(value: unknown, fallback: string) {
    return value instanceof Error && value.message ? value.message : fallback
}

const root = document.getElementById('root')
if (root) createRoot(root).render(<App />)
