import { executionDuration, executionSummary, formatExecutionDuration } from './execution-summary'
import { texts } from './i18n'
import type { Attempt } from './model'
import { graphSchema } from './bridge'
jest.mock('@xpert-ai/shadcn-ui', () => ({ installShadcnThemeVars: jest.fn() }))
const start = '2026-10-19T10:00:00Z',
    end = '2026-10-19T10:01:16Z'
const attempt: Attempt = {
    id: 'execution',
    taskId: 'task',
    attempt: 1,
    status: 'succeeded',
    runtimeStatus: 'succeeded',
    runtimeStartedAt: start,
    runtimeCompletedAt: end
}
const reviewPurpose: NonNullable<Attempt['purpose']> = {
    type: 'review',
    implementationExecutionId: '11111111-1111-4111-8111-111111111111',
    implementationInvocationId: '22222222-2222-4222-8222-222222222222',
    specificationDigest: `sha256:${'a'.repeat(64)}`,
    evidence: [{ type: 'invocation_result', invocationId: '22222222-2222-4222-8222-222222222222', revision: 3 }]
}
it('uses observed runtime times, not the projection registration time', () => {
    expect(executionDuration({ ...attempt, startedAt: '2026-10-18T00:00:00Z' }, Date.now())).toBe(76000)
    expect(formatExecutionDuration(76000, 'zh-Hans')).toBe('1分 16秒')
})
it('does not invent a duration for missing, invalid or terminal-without-end times', () => {
    for (const changes of [
        { runtimeStartedAt: null },
        { runtimeCompletedAt: null },
        { runtimeCompletedAt: 'invalid' },
        { runtimeCompletedAt: '2026-10-18T00:00:00Z' }
    ]) {
        expect(executionDuration({ ...attempt, ...changes }, Date.now())).toBeNull()
    }
})
it('measures running attempts against the supplied observation or historical snapshot', () => {
    expect(executionDuration({ ...attempt, runtimeStatus: 'running', runtimeCompletedAt: null }, Date.parse(end))).toBe(
        76000
    )
    expect(executionDuration({ ...attempt, runtimeStatus: 'running', runtimeCompletedAt: null }, NaN)).toBeNull()
})
it('keeps runtime success distinct from a rejected business result', () => {
    expect(executionSummary({ ...attempt, outputSummary: 'rejected' }, texts('zh-Hans'))).toMatchObject({
        succeeded: true,
        failed: false,
        businessResult: texts('zh-Hans').rejected
    })
})

it('prefers full Invocation status over stale native or Task state', () => {
    expect(
        executionSummary(
            { ...attempt, invocationStatus: 'succeeded', runtimeStatus: 'running', status: 'failed' },
            texts('zh-Hans')
        )
    ).toMatchObject({
        state: 'succeeded',
        succeeded: true,
        failed: false,
        businessResult: texts('zh-Hans').failed
    })
    expect(executionSummary({ ...attempt, invocationStatus: 'waiting' }, texts('zh-Hans'))).toMatchObject({
        state: 'waiting',
        succeeded: false,
        failed: false
    })
    expect(executionSummary({ ...attempt, runtimeStatus: 'error' }, texts('zh-Hans'))).toMatchObject({
        failed: true,
        succeeded: false
    })
})

it.each([
    ['pass', '评审通过', 'Review passed'],
    ['changes_required', '需修改', 'Changes required'],
    ['indeterminate', '无法判断', 'Indeterminate']
] as const)('shows the %s verdict independently of successful runtime completion', (reviewVerdict, zh, en) => {
    const value: Attempt = { ...attempt, purpose: reviewPurpose, reviewVerdict }
    expect(executionSummary(value, texts('zh-Hans'))).toMatchObject({
        succeeded: true, failed: false, businessResult: zh, label: '独立评审 · 运行成功', color: 'bg-[var(--success)]'
    })
    expect(executionSummary(value, texts('en-US'))).toMatchObject({ businessResult: en, label: 'Independent review · Runtime succeeded' })
})

it.each(['running', 'waiting', 'unknown', 'failed', 'cancelled'] as const)(
    'does not show a stale passing verdict for a %s runtime', (invocationStatus) => {
        const summary = executionSummary({ ...attempt, purpose: reviewPurpose, reviewVerdict: 'pass', invocationStatus }, texts('en-US'))
        expect(summary.succeeded).toBe(false)
        expect(summary.businessResult).toBeNull()
    }
)

it('uses declared execution purpose for labels and never infers a verdict from success', () => {
    expect(executionSummary(attempt, texts('en-US')).label).toBe('Runtime succeeded')
    expect(executionSummary({ ...attempt, purpose: { type: 'implementation' }, reviewVerdict: 'pass' }, texts('en-US')))
        .toMatchObject({ label: 'Implementation · Runtime succeeded', businessResult: null })
    expect(executionSummary({ ...attempt, purpose: reviewPurpose }, texts('en-US')))
        .toMatchObject({ label: 'Independent review · Runtime succeeded', businessResult: null })
    const rework: Attempt = { ...attempt, purpose: { type: 'implementation', rework: {
        reviewExecutionId: '33333333-3333-4333-8333-333333333333', findingIds: ['F1']
    } } }
    expect(executionSummary(rework, texts('zh-Hans')).label).toBe('反馈返工 · 运行成功')
    expect(executionSummary(rework, texts('en-US')).label).toBe('Rework · Runtime succeeded')
})

it('retains execution purpose and verdict through the graph response boundary', () => {
    const graph = graphSchema.parse({
        projectId: 'project', cursor: 'revision', tasks: [], diagnostics: [],
        executions: [{ ...attempt, purpose: reviewPurpose, reviewVerdict: 'changes_required' }]
    })
    expect(executionSummary(graph.executions[0], texts('en-US'))).toMatchObject({
        succeeded: true, label: 'Independent review · Runtime succeeded', businessResult: 'Changes required'
    })
})
