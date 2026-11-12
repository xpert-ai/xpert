import { HttpException } from '@nestjs/common'
import { t } from 'i18next'
import type { ProjectTaskReviewReportDiagnostic } from './project-task-review-report-diagnostic'

export type ProjectTaskRuntimeErrorCode =
    | 'Invalid'
    | 'Scope'
    | 'Conflict'
    | 'Busy'
    | 'Dependencies'
    | 'NotFound'
    | 'State'
    | 'Owned'
    | 'Evidence'
    | 'DecisionRequired'
    | 'AssigneeRequired'
    | 'ReviewCandidateChanged'
    | 'ReviewReport'
    | 'ReviewerRequired'
    | 'ReviewFeedback'
export function projectTaskRuntimeError(code: ProjectTaskRuntimeErrorCode, diagnostic?: ProjectTaskReviewReportDiagnostic | null) {
    const status = code === 'Scope' ? 403 : code === 'NotFound' ? 404 : code === 'Invalid' ? 400 : 409
    const message = t(`server-ai:Error.ProjectTaskRuntime${code}`)
    // Tool callers consume the exception message; task details expose the same diagnostic as structured data.
    return new HttpException(diagnostic ? t('server-ai:ReviewReportDiagnostic.ErrorWithDiagnostic', {
        defaultValue: '{{message}} Diagnostic: {{diagnostic}}', message, diagnostic: JSON.stringify(diagnostic),
        interpolation: { escapeValue: false }
    }) : message, status)
}
