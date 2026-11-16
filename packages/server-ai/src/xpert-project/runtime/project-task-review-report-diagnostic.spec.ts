import { diagnoseReviewReport } from './project-task-review-report-diagnostic'
import { reviewReport } from './project-task-evidence'
import type { ProjectTaskExecutionPurpose } from '@xpert-ai/contracts'
const purpose: ProjectTaskExecutionPurpose = {
    type: 'review',
    implementationExecutionId: '00000000-0000-4000-8000-000000000001',
    implementationInvocationId: '00000000-0000-4000-8000-000000000002',
    specificationDigest: `sha256:${'a'.repeat(64)}`,
    evidence: [{ type: 'invocation_result', invocationId: '00000000-0000-4000-8000-000000000002', revision: 1 }]
}
it.each(['# Review\nNot deployed', 'All tests passed', '```json\n{"version":1,"summary":{}}\n```'])(
    'preserves arbitrary report text without interpreting a verdict',
    (text) => {
        expect(diagnoseReviewReport(purpose, text)).toBeNull()
        expect(reviewReport(purpose, text)).toEqual({ format: 'markdown', markdown: text })
    }
)
it.each(['', '   ', undefined])('reports missing delivery without requesting another coding run', (text) => {
    expect(diagnoseReviewReport(purpose, text)?.code).toBe('missing_report')
    expect(reviewReport(purpose, text)).toBeNull()
})
it('retains host subject validation independently of report prose', () => {
    expect(diagnoseReviewReport({ type: 'implementation' }, 'Passed')?.code).toBe('invalid_subject')
    expect(reviewReport({ type: 'implementation' }, 'Passed')).toBeNull()
})
