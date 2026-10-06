import { useEffect, useState } from 'react'
import { z } from 'zod/v3'
import { Button, Textarea, Label } from '@xpert-ai/shadcn-ui'
import {
    agentInvocationStatusSchema,
    agentRuntimeProgressSchema,
    projectTaskExecutionPurposeSchema,
    projectTaskEvidenceReferenceSchema,
    projectTaskReviewReportSchema,
    projectTaskDecisionSchema
} from '@xpert-ai/contracts'
import { request } from './bridge'

const receipt = z.object({ state: z.string(), lastError: z.string().nullish() })
const detailSchema = z.object({
    id: z.string(),
    revision: z.number(),
    status: z.string(),
    requirements: z.array(z.string()).nullish(),
    specificationSnapshot: z.object({ digest: z.string() }).nullish(),
    decisions: z.array(projectTaskDecisionSchema).default([]),
    executions: z.array(
        z.object({
            id: z.string(),
            attempt: z.number(),
            invocationId: z.string().nullish(),
            invocationStatus: agentInvocationStatusSchema.nullish(),
            invocationRevision: z.number().optional(),
            runtimeProvider: z.string().optional(),
            purpose: projectTaskExecutionPurposeSchema.nullish(),
            progress: agentRuntimeProgressSchema.nullish(),
            observedAt: z.string().optional(),
            evidence: z.array(projectTaskEvidenceReferenceSchema).optional(),
            reviewReport: projectTaskReviewReportSchema.nullish(),
            result: z
                .object({
                    text: z.string(),
                    artifacts: z
                        .array(
                            z.object({ id: z.string(), name: z.string().optional(), versionId: z.string().optional() })
                        )
                        .optional()
                })
                .nullish(),
            error: z.string().nullish(),
            observation: z.string().optional(),
            delivery: z.array(receipt).optional(),
            consumption: z.array(receipt).optional()
        })
    )
})
type Detail = z.output<typeof detailSchema>
const zh = {
    requestCheck: '重试回传并请求检查',
    open: '打开负责人对话',
    evidence: '结果与验收',
    requirements: '完成要求',
    implementation: '实现',
    review: '独立验收 · 仅证据',
    waiting: '结果已产生，等待负责人处理',
    processed: '负责人已消费结果，业务完成仍需明确确认',
    host: '平台观测',
    executor: '执行器报告',
    observed: '最后观察',
    cancel: '取消本次运行',
    rationale: '完成或返工依据',
    checks: '已执行的检查（每行一项）',
    accept: '确认完成',
    rework: '要求返工',
    unknown: '无可验证的结构化验收结论',
    restricted: '此运行的结果访问受限',
    saved: '决定已记录',
    error: '操作失败',
    pass: '通过',
    changes_required: '需修改',
    indeterminate: '无法判断',
    sourceNote: '活动时间不代表工作推进；运行成功不等于任务通过验收。',
    pending: '等待中',
    running: '运行中',
    queued: '排队中',
    succeeded: '运行成功',
    failed: '运行失败',
    cancelled: '已取消',
    cancelling: '正在取消',
    statusUnknown: '状态待核实',
    waitingInput: '等待输入',
    delivery: '回传',
    consumption: '结果处理',
    limitations: '检查限制',
    history: '业务决定记录',
    accepted: '完成决定已记录',
    working: '执行中',
    completed: '执行结束',
    received: '已接收',
    processing: '处理中',
    receiptProcessed: '已处理',
    blocked: '受阻',
    sending: '投递中',
    user: '用户',
    xpert: '负责助手',
    project_agent: '项目主 Agent'
}
const en: typeof zh = {
    requestCheck: 'Retry delivery for review',
    open: 'Open responsible conversation',
    evidence: 'Results & acceptance',
    requirements: 'Requirements',
    implementation: 'Implementation',
    review: 'Independent review · evidence only',
    waiting: 'Result ready; waiting for the responsible Agent',
    processed: 'Result consumed; business acceptance still requires a decision',
    host: 'Host observation',
    executor: 'Executor report',
    observed: 'Last observed',
    cancel: 'Cancel this attempt',
    rationale: 'Acceptance or rework rationale',
    checks: 'Checks performed (one per line)',
    accept: 'Accept task',
    rework: 'Request rework',
    unknown: 'No verifiable structured review verdict',
    restricted: 'Runtime result access is restricted',
    saved: 'Decision recorded',
    error: 'Action failed',
    pass: 'Pass',
    changes_required: 'Changes required',
    indeterminate: 'Indeterminate',
    sourceNote: 'Activity does not prove progress; runtime success does not accept a task.',
    pending: 'Pending',
    running: 'Running',
    queued: 'Queued',
    succeeded: 'Succeeded',
    failed: 'Failed',
    cancelled: 'Cancelled',
    cancelling: 'Cancelling',
    statusUnknown: 'Needs reconciliation',
    waitingInput: 'Waiting for input',
    delivery: 'Delivery',
    consumption: 'Consumption',
    limitations: 'Limitations',
    history: 'Business decisions',
    accepted: 'Business acceptance recorded',
    working: 'Working',
    completed: 'Finished',
    received: 'Received',
    processing: 'Processing',
    receiptProcessed: 'Processed',
    blocked: 'Blocked',
    sending: 'Sending',
    user: 'User',
    xpert: 'Responsible Assistant',
    project_agent: 'Project Agent'
}

export function RuntimeDetail({
    taskId,
    locale,
    canEdit,
    openAttempt
}: {
    taskId: string
    locale: string
    canEdit: boolean
    openAttempt: (id: string) => void
}) {
    const t = locale.startsWith('zh') ? zh : en
    const receiptLabels: { [state: string]: string } = {
        pending: t.pending,
        sending: t.sending,
        received: t.received,
        processing: t.processing,
        processed: t.receiptProcessed,
        failed: t.failed,
        blocked: t.blocked
    }
    const [detail, setDetail] = useState<Detail | null>(null)
    const [error, setError] = useState(''),
        [busy, setBusy] = useState(false),
        [saved, setSaved] = useState(false)
    const [rationale, setRationale] = useState(''),
        [checks, setChecks] = useState('')
    useEffect(() => {
        let active = true,
            loading = false
        setDetail(null)
        setError('')
        setRationale('')
        setChecks('')
        setSaved(false)
        const load = async () => {
            if (loading || document.hidden) return
            loading = true
            try {
                const data = z
                    .object({ success: z.literal(true), data: detailSchema })
                    .parse(await request('executeAction', { actionKey: 'task-detail', input: { taskId } }))
                if (active) setDetail(data.data)
            } catch (error) {
                if (active) setError(error instanceof Error ? error.message : t.error)
            } finally {
                loading = false
            }
        }
        void load()
        const timer = window.setInterval(() => void load(), 5000)
        return () => {
            active = false
            window.clearInterval(timer)
        }
    }, [taskId, t.error])
    const act = async (actionKey: string, input: object) => {
        setBusy(true)
        setError('')
        try {
            z.object({ success: z.literal(true) }).parse(await request('executeAction', { actionKey, input }))
            setSaved(actionKey === 'decide-task')
            const result = z
                .object({ data: detailSchema })
                .parse(await request('executeAction', { actionKey: 'task-detail', input: { taskId } }))
            setDetail(result.data)
        } catch (error) {
            setError(error instanceof Error ? error.message : t.error)
        } finally {
            setBusy(false)
        }
    }
    const implementation = detail?.executions.find((item) => item.purpose?.type === 'implementation')
    const review = detail?.executions.find(
        (item) => item.purpose?.type === 'review' && item.purpose.implementationExecutionId === implementation?.id
    )
    const decide = (outcome: 'accept' | 'rework') => {
        if (!detail || !implementation?.evidence || !detail.specificationSnapshot) return
        void act('decide-task', {
            requestId: crypto.randomUUID(),
            taskId,
            expectedRevision: detail.revision,
            implementationExecutionId: implementation.id,
            specificationDigest: detail.specificationSnapshot.digest,
            evidence: implementation.evidence,
            ...(review?.reviewReport ? { reviewExecutionId: review.id } : {}),
            outcome,
            rationale,
            checks: checks
                .split('\n')
                .map((line) => line.trim())
                .filter(Boolean)
        })
    }
    return (
        <section className="space-y-4 border-t pt-4" aria-label={t.evidence}>
            <h3 className="text-sm font-semibold">{t.evidence}</h3>
            <p className="text-xs text-muted-foreground">{t.sourceNote}</p>
            {error && (
                <p role="alert" className="break-words text-sm text-destructive">
                    {error}
                </p>
            )}
            {!!detail?.requirements?.length && (
                <div>
                    <h4 className="text-xs font-medium">{t.requirements}</h4>
                    <ul className="list-inside list-disc text-sm">
                        {detail.requirements.map((item, index) => (
                            <li key={index}>{item}</li>
                        ))}
                    </ul>
                </div>
            )}
            {detail?.executions
                .filter((item) => item.invocationId)
                .map((attempt) => (
                    <section key={attempt.id} className="space-y-2 border-t pt-3">
                        <h4 className="text-sm font-medium">
                            #{attempt.attempt} · {attempt.purpose?.type === 'review' ? t.review : t.implementation} ·{' '}
                            {attempt.runtimeProvider}
                        </h4>
                        <p className="text-xs">
                            {attempt.invocationStatus === 'unknown'
                                ? t.statusUnknown
                                : attempt.invocationStatus === 'waiting'
                                  ? t.waitingInput
                                  : attempt.invocationStatus
                                    ? t[attempt.invocationStatus]
                                    : t.pending}
                        </p>
                        {attempt.observation === 'restricted' && <p className="text-xs">{t.restricted}</p>}
                        {attempt.progress && (
                            <p className="text-sm">
                                {t[attempt.progress.source]} ·{' '}
                                {attempt.progress.phase === 'working'
                                    ? t.working
                                    : attempt.progress.phase === 'completed'
                                      ? t.completed
                                      : attempt.progress.phase}{' '}
                                {attempt.progress.summary}{' '}
                                {attempt.progress.steps &&
                                    `${attempt.progress.steps.completed}/${attempt.progress.steps.total}`}
                            </p>
                        )}
                        {attempt.observedAt && (
                            <p className="text-xs text-muted-foreground">
                                {t.observed}: {new Date(attempt.observedAt).toLocaleString(locale)}
                            </p>
                        )}
                        {attempt.invocationStatus === 'succeeded' && (
                            <p className="text-xs">
                                {detail.status === 'done'
                                    ? t.accepted
                                    : attempt.consumption?.some((item) => item.state === 'processed')
                                      ? t.processed
                                      : t.waiting}
                            </p>
                        )}
                        {(['delivery', 'consumption'] as const).map((key) =>
                            attempt[key]?.map((receipt, index) => (
                                <p key={`${key}-${index}`} className="break-words text-xs text-muted-foreground">
                                    {t[key]}: {receiptLabels[receipt.state] ?? receipt.state} {receipt.lastError}
                                </p>
                            ))
                        )}
                        <Button size="sm" variant="ghost" onClick={() => openAttempt(attempt.id)}>
                            {t.open}
                        </Button>
                        {canEdit &&
                            [...(attempt.delivery ?? []), ...(attempt.consumption ?? [])].some((item) =>
                                ['failed', 'blocked'].includes(item.state)
                            ) && (
                                <Button
                                    size="sm"
                                    variant="outline"
                                    disabled={busy}
                                    onClick={() => void act('request-check', { taskId, executionId: attempt.id })}
                                >
                                    {t.requestCheck}
                                </Button>
                            )}
                        {attempt.error && <p className="break-words text-sm text-destructive">{attempt.error}</p>}
                        {attempt.reviewReport && (
                            <div className="space-y-1 text-sm">
                                <strong>{t[attempt.reviewReport.verdict]}</strong>
                                {attempt.reviewReport.findings.map((item, index) => (
                                    <p key={index}>{item}</p>
                                ))}
                                <p className="text-xs text-muted-foreground">
                                    {t.limitations}: {attempt.reviewReport.limitations.join('; ')}
                                </p>
                            </div>
                        )}
                        {attempt.purpose?.type === 'review' &&
                            attempt.invocationStatus === 'succeeded' &&
                            !attempt.reviewReport && <p className="text-sm">{t.unknown}</p>}
                        {attempt.result?.text && (
                            <details>
                                <summary className="cursor-pointer text-xs">{t.evidence}</summary>
                                <pre className="max-h-80 overflow-auto whitespace-pre-wrap break-words text-xs">
                                    {attempt.result.text}
                                </pre>
                            </details>
                        )}
                        {attempt.result?.artifacts?.map((artifact) => (
                            <p key={artifact.id} className="break-all text-xs">
                                {artifact.name} · {artifact.versionId}
                            </p>
                        ))}
                        {canEdit &&
                            attempt.invocationStatus &&
                            !['succeeded', 'failed', 'cancelled'].includes(attempt.invocationStatus) && (
                                <Button
                                    size="sm"
                                    variant="outline"
                                    disabled={busy}
                                    onClick={() => void act('cancel-attempt', { taskId, executionId: attempt.id })}
                                >
                                    {t.cancel}
                                </Button>
                            )}
                    </section>
                ))}
            {canEdit &&
                implementation?.evidence &&
                detail &&
                ['review', 'blocked', 'in_progress'].includes(detail.status) && (
                    <div className="space-y-2 border-t pt-3">
                        <Label htmlFor="decision-rationale">{t.rationale}</Label>
                        <Textarea
                            id="decision-rationale"
                            value={rationale}
                            onChange={(event) => setRationale(event.target.value)}
                        />
                        <Label htmlFor="decision-checks">{t.checks}</Label>
                        <Textarea
                            id="decision-checks"
                            value={checks}
                            onChange={(event) => setChecks(event.target.value)}
                        />
                        <div className="flex gap-2">
                            <Button
                                size="sm"
                                disabled={
                                    busy ||
                                    !rationale.trim() ||
                                    !checks.trim() ||
                                    implementation.invocationStatus !== 'succeeded' ||
                                    (!!review &&
                                        (review.invocationStatus !== 'succeeded' ||
                                            review.reviewReport?.verdict !== 'pass'))
                                }
                                onClick={() => decide('accept')}
                            >
                                {t.accept}
                            </Button>
                            <Button
                                size="sm"
                                variant="outline"
                                disabled={busy || !rationale.trim() || !checks.trim()}
                                onClick={() => decide('rework')}
                            >
                                {t.rework}
                            </Button>
                        </div>
                    </div>
                )}
            {saved && (
                <p role="status" className="text-xs">
                    {t.saved}
                </p>
            )}
            {!!detail?.decisions.length && (
                <div className="space-y-2 border-t pt-3">
                    <h4 className="text-xs font-medium">{t.history}</h4>
                    {detail.decisions.map((item) => (
                        <div key={item.requestId} className="text-xs">
                            <p>
                                {item.outcome === 'accept' ? t.accept : t.rework} · {t[item.actorType]} ·{' '}
                                {new Date(item.decidedAt).toLocaleString(locale)}
                            </p>
                            <p>{item.rationale}</p>
                            {item.checks.map((check, index) => (
                                <p key={index}>{check}</p>
                            ))}
                        </div>
                    ))}
                </div>
            )}
        </section>
    )
}
