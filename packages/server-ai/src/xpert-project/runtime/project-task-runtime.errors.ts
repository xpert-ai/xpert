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
export function projectTaskRuntimeError(
    code: ProjectTaskRuntimeErrorCode,
    diagnostic?: ProjectTaskReviewReportDiagnostic | null
) {
    const status = code === 'Scope' ? 403 : code === 'NotFound' ? 404 : code === 'Invalid' ? 400 : 409
    const fallback: Partial<Record<ProjectTaskRuntimeErrorCode, string>> = {
        DecisionRequired:
            'Runtime-backed task completion is recorded by project_decide_task using a decisionRef from project_get_task. Ordinary status or step updates cannot record acceptance. If the task is already accepted, completion is recorded; do not repeat the decision or completion updates just to check off steps.',
        Dependencies:
            'Required predecessor tasks or sibling implementation tasks are unfinished. Read predecessorIds and childTasks, then finish the required work before dispatch or summary acceptance.',
        ReviewerRequired:
            'An independent review is required. Read the implementation task and dispatch its assigned reviewer before accepting.'
    }
    const message = t(`server-ai:Error.ProjectTaskRuntime${code}`, { defaultValue: fallback[code] })
    // Tool callers consume the exception message; task details expose the same diagnostic as structured data.
    return new HttpException(
        diagnostic
            ? t('server-ai:ReviewReportDiagnostic.ErrorWithDiagnostic', {
                  defaultValue: '{{message}} Diagnostic: {{diagnostic}}',
                  message,
                  diagnostic: JSON.stringify(diagnostic),
                  interpolation: { escapeValue: false }
              })
            : message,
        status
    )
}
