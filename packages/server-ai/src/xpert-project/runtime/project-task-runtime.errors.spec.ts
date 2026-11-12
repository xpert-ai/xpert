import i18next from 'i18next'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { projectTaskRuntimeError } from './project-task-runtime.errors'
import { diagnoseReviewReport } from './project-task-review-report-diagnostic'

it.each(['en', 'en-US', 'zh-Hans'])('returns actionable ownership recovery copy in %s', async (lng) => {
    const previousLanguage = i18next.language
    try {
        await i18next.init({
            lng,
            resources: {
                [lng]: { 'server-ai': JSON.parse(readFileSync(join(__dirname, '../../i18n', `${lng}.json`), 'utf8')) }
            }
        })
        const error = projectTaskRuntimeError('AssigneeRequired')
        expect(error.getStatus()).toBe(409)
        expect(error.message).toBe(i18next.t('server-ai:Error.ProjectTaskRuntimeAssigneeRequired'))
        expect(error.message).toContain(lng === 'zh-Hans' ? '重试' : 'retry')
        expect(error.message).toContain(lng === 'zh-Hans' ? '最新任务版本' : 'latest task revision')
        expect(error.message).not.toContain('server-ai:')
        const diagnostic = diagnoseReviewReport({ type: 'review', mode: 'evidence_only',
            implementationExecutionId: '11111111-1111-4111-8111-111111111111',
            implementationInvocationId: '22222222-2222-4222-8222-222222222222',
            specificationDigest: `sha256:${'a'.repeat(64)}`,
            evidence: [{ type: 'invocation_result', invocationId: '22222222-2222-4222-8222-222222222222', revision: 3 }] })
        const reportError = projectTaskRuntimeError('ReviewReport', diagnostic)
        expect(reportError.getStatus()).toBe(409)
        expect(reportError.message).toContain(lng === 'zh-Hans' ? '仅有格式错误无需重复业务测试' : 'does not require repeating business tests')
        expect(reportError.message).toContain(lng === 'zh-Hans' ? '诊断：' : 'Diagnostic:')
        expect(reportError.message).toContain(JSON.stringify(diagnostic))
        expect(reportError.message).not.toContain('&quot;')
        expect(reportError.message).not.toContain('server-ai:')
        expect(projectTaskRuntimeError('ReviewReport').message).toBe(i18next.t('server-ai:Error.ProjectTaskRuntimeReviewReport'))
    } finally {
        if (previousLanguage) await i18next.changeLanguage(previousLanguage)
    }
})
