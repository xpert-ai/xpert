// Report presence is a transport check, not a business verdict.
import { projectTaskExecutionPurposeSchema, type ProjectTaskExecutionPurpose } from '@xpert-ai/contracts'
import { t } from 'i18next'
export type ProjectTaskReviewReportDiagnostic = {
    code: 'invalid_subject' | 'missing_report'
    issues: { path: string; message: string }[]
}
export function diagnoseReviewReport(
    purpose: ProjectTaskExecutionPurpose | null | undefined,
    text?: string
): ProjectTaskReviewReportDiagnostic | null {
    const subject = projectTaskExecutionPurposeSchema.safeParse(purpose)
    if (!subject.success || subject.data.type !== 'review')
        return {
            code: 'invalid_subject',
            issues: [
                {
                    path: 'purpose',
                    message: t('server-ai:ReviewReportDiagnostic.InvalidSubject', {
                        defaultValue: 'The host review subject is invalid.'
                    })
                }
            ]
        }
    if (!text?.trim())
        return {
            code: 'missing_report',
            issues: [
                {
                    path: 'result.text',
                    message: t('server-ai:ReviewReportDiagnostic.MissingMarkdown', {
                        defaultValue:
                            'Independent review needs an assessment in the final reply or an explicitly selected report file. Recover delivery only if that file exists and the runtime supports reading it.'
                    })
                }
            ]
        }
    return null
}
