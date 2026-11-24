import { HttpException } from '@nestjs/common'
import { t } from 'i18next'
import type { ProjectTaskReviewReportDiagnostic } from './project-task-review-report-diagnostic'

/** Report the task revision separately from invocation and historical decision revisions. */
export function projectTaskRevisionConflict(expectedRevision: number, currentRevision: number) {
    return new HttpException(
        t('server-ai:Error.ProjectTaskRuntimeRevisionConflict', {
            defaultValue:
                'Dispatch expected task revision {{expectedRevision}}, but the current task revision is {{currentRevision}}. Read project_get_task and copy its top-level revision exactly. Do not use invocationRevision, an earlier decision revision, or increment a revision. Reassess the current task before a new delegation.',
            expectedRevision,
            currentRevision
        }),
        409
    )
}

export type ProjectTaskRuntimeErrorCode =
    | 'Invalid'
    | 'Scope'
    | 'Conflict'
    | 'Busy'
    | 'Dependencies'
    | 'NotFound'
    | 'NoInvocation'
    | 'ResultUnavailable'
    | 'ResultRevisionChanged'
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
        ResultUnavailable:
            'This authorized Runtime invocation has no result report. Read its status and error in project_get_task. Do not retry report reads or guess revisions. If execution is still active, end the turn and await durable delivery; if it failed or was cancelled, decide recovery from that execution error before delegating again.',
        ResultRevisionChanged:
            'The result revision has changed. Read project_get_task again and copy the observed invocationRevision or report paging reference exactly. Do not increment or guess expectedRevision.',
        NoInvocation:
            'This execution has no delegated Runtime invocation, so it has no Runtime report or archived delegation prompt. Do not retry by guessing revisions. Pipeline stage status and errors are in project_get_task; create or resume an ordinary implementation child when delegation is still required.',
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
