// Diagnostics explain a rejected delivery; they never repair, unwrap or authorize a report.
import {
    ProjectTaskExecutionPurpose,
    projectTaskExecutionPurposeSchema,
    projectTaskExecutionReviewReportSchema,
    projectTaskReviewReportSchema
} from '@xpert-ai/contracts'
import { agentTaskResultSchema } from '@xpert-ai/plugin-sdk'
import { t } from 'i18next'
import type { ZodIssue } from 'zod/v3'
import { sameInvocationData } from '../../agent-invocation/invocation-runtime'
import { reviewReport } from './project-task-evidence'

export type ProjectTaskReviewReportDiagnostic = {
    code: 'invalid_subject' | 'missing_report' | 'invalid_json' | 'outer_envelope_invalid' |
        'outer_envelope_unparsed' | 'report_schema_invalid' | 'subject_mismatch' | 'evidence_mismatch' | 'evidence_order_mismatch'
    issues: { path: string; message: string; code?: 'evidence_mismatch' | 'evidence_order_mismatch' }[]
    truncated?: true
}
type ReviewSubject = Extract<ProjectTaskExecutionPurpose, { type?: 'review' }>
type Issue = ProjectTaskReviewReportDiagnostic['issues'][number]
const MAX_ISSUES = 20

function diagnostic(code: ProjectTaskReviewReportDiagnostic['code'], issues: Issue[]): ProjectTaskReviewReportDiagnostic {
    return { code, issues: issues.slice(0, MAX_ISSUES), ...(issues.length > MAX_ISSUES ? { truncated: true as const } : {}) }
}

function issuePath(parts: (string | number)[], prefix = '') {
    return [prefix, ...parts.slice(0, 8).map((part) => String(part).slice(0, 80))].filter(Boolean).join('.') || '$'
}

function schemaIssues(issues: ZodIssue[], prefix = ''): Issue[] {
    return [...issues].sort((a, b) => a.path.length - b.path.length).slice(0, MAX_ISSUES + 1).flatMap((issue): Issue[] => {
        if (issue.code === 'unrecognized_keys')
            return issue.keys.slice(0, MAX_ISSUES + 1).map((key) => ({
                path: issuePath([...issue.path, key], prefix), message: t('server-ai:ReviewReportDiagnostic.UnexpectedField', {
                    defaultValue: 'Unexpected field; remove it from the delivered report.'
                })
            }))
        // Use schema-owned constraints, never Zod's raw message or the rejected input value.
        const message = issue.code === 'invalid_type' ? t('server-ai:ReviewReportDiagnostic.ExpectedType', {
                defaultValue: 'Expected {{expected}}; received {{received}}.', expected: issue.expected, received: issue.received
            })
            : issue.code === 'invalid_literal' ? t('server-ai:ReviewReportDiagnostic.ExpectedLiteral', {
                defaultValue: 'Expected {{expected}}.', expected: JSON.stringify(issue.expected)
            })
            : issue.code === 'invalid_enum_value' ? t('server-ai:ReviewReportDiagnostic.ExpectedEnum', {
                defaultValue: 'Expected one of: {{options}}.', options: issue.options.join(', ')
            })
            : issue.code === 'too_big' ? t('server-ai:ReviewReportDiagnostic.Maximum', {
                defaultValue: 'Exceeds maximum {{maximum}}.', maximum: issue.maximum
            })
            : issue.code === 'too_small' ? t('server-ai:ReviewReportDiagnostic.Minimum', {
                defaultValue: 'Requires minimum {{minimum}}.', minimum: issue.minimum
            })
            : issue.code === 'custom' ? t('server-ai:ReviewReportDiagnostic.Consistency', {
                defaultValue: 'Violates report consistency rules (unique finding IDs; no blocking finding with pass).'
            })
            : t('server-ai:ReviewReportDiagnostic.InvalidValue', { defaultValue: 'Invalid value ({{code}}).', code: issue.code })
        return [{ path: issuePath(issue.path, prefix), message: message.slice(0, 240) }]
    }).slice(0, MAX_ISSUES + 1)
}

function reportDiagnostic(subject: ReviewSubject, value: unknown, prefix = ''): ProjectTaskReviewReportDiagnostic | null {
    const schema = subject.mode === 'execution' ? projectTaskExecutionReviewReportSchema : projectTaskReviewReportSchema.options[0]
    const parsed = schema.safeParse(value)
    // Diagnose pinned references even when unrelated report fields are malformed. This never accepts the report.
    const identity = projectTaskReviewReportSchema.options[0].pick({
        implementationInvocationId: true, specificationDigest: true, evidence: true
    }).strip().safeParse(value)
    const mismatches: Issue[] = []
    if (identity.success && identity.data.implementationInvocationId !== subject.implementationInvocationId)
        mismatches.push({ path: issuePath(['implementationInvocationId'], prefix), message: t('server-ai:ReviewReportDiagnostic.ImplementationMismatch', {
            defaultValue: 'Must equal purpose.implementationInvocationId for the pinned implementation.'
        }) })
    if (identity.success && identity.data.specificationDigest !== subject.specificationDigest)
        mismatches.push({ path: issuePath(['specificationDigest'], prefix), message: t('server-ai:ReviewReportDiagnostic.SpecificationMismatch', {
            defaultValue: 'Must equal purpose.specificationDigest, not the candidate file snapshot digest.'
        }) })
    const subjectMismatch = mismatches.length > 0
    let evidenceCode: 'evidence_mismatch' | 'evidence_order_mismatch' = 'evidence_mismatch'
    if (identity.success && !sameInvocationData(identity.data.evidence, subject.evidence)) {
        const remaining = [...subject.evidence]
        const sameReferences = identity.data.evidence.length === remaining.length && identity.data.evidence.every((reference) => {
            const index = remaining.findIndex((expected) => sameInvocationData(reference, expected))
            if (index < 0) return false
            remaining.splice(index, 1)
            return true
        })
        evidenceCode = sameReferences ? 'evidence_order_mismatch' : 'evidence_mismatch'
        mismatches.push({ path: issuePath(['evidence'], prefix),
            code: evidenceCode,
            message: sameReferences ? t('server-ai:ReviewReportDiagnostic.EvidenceOrderMismatch', {
                defaultValue: 'Evidence references match, but their order differs. Preserve the current purpose.evidence array order exactly.'
            }) : t('server-ai:ReviewReportDiagnostic.EvidenceMismatch', {
                defaultValue: 'Evidence references differ from purpose.evidence. Preserve the pinned IDs, revisions, versions and array order exactly.'
            }) })
    }
    if (!parsed.success) return diagnostic('report_schema_invalid', [...mismatches, ...schemaIssues(parsed.error.issues, prefix)])
    if (mismatches.length) return diagnostic(subjectMismatch ? 'subject_mismatch' : evidenceCode, mismatches)
    return null
}

export function diagnoseReviewReport(
    purpose: ProjectTaskExecutionPurpose | null | undefined,
    resultText?: string
): ProjectTaskReviewReportDiagnostic | null {
    if (reviewReport(purpose, resultText)) return null
    const parsedPurpose = projectTaskExecutionPurposeSchema.safeParse(purpose)
    if (!parsedPurpose.success) return diagnostic('invalid_subject', [{ path: 'purpose', message: t('server-ai:ReviewReportDiagnostic.InvalidSubject', {
        defaultValue: 'The pinned review purpose is invalid.'
    }) }])
    if (parsedPurpose.data.type !== 'review') return null
    if (!resultText) return diagnostic('missing_report', [{ path: 'result.text', message: t('server-ai:ReviewReportDiagnostic.MissingReport', {
        defaultValue: 'The invocation has no delivered review report.'
    }) }])
    const subject = parsedPurpose.data
    const trimmed = resultText.trim()
    const fenced = /^```(xpert-task-result|json)\s*\n([\s\S]*?)\n```$/.exec(trimmed)
    let value: unknown
    try { value = JSON.parse(fenced?.[2] ?? trimmed) }
    catch { return diagnostic('invalid_json', [{ path: 'result.text', message: t('server-ai:ReviewReportDiagnostic.InvalidJson', {
        defaultValue: 'Expected JSON report text after the runner unwraps the outer summary string.'
    }) }]) }
    // Inspect an explicit outer envelope only to explain rejection. Never return its nested report.
    if (typeof value === 'object' && value !== null && 'summary' in value &&
        (fenced?.[1] === 'xpert-task-result' || ('version' in value && value.version === 1 && 'items' in value))) {
        const envelope = agentTaskResultSchema.safeParse(value)
        const issues = envelope.success ? [] : schemaIssues(envelope.error.issues)
        let inner: unknown = value.summary
        if (typeof inner === 'string') {
            try { inner = JSON.parse(inner) }
            catch {
                issues.push({ path: 'summary', message: t('server-ai:ReviewReportDiagnostic.EncodedSummary', {
                    defaultValue: 'Must be a JSON-encoded STRING containing the review report.'
                }) })
                inner = undefined
            }
        }
        const innerDiagnostic = inner !== undefined ? reportDiagnostic(subject, inner, 'summary') : null
        issues.push(...(innerDiagnostic?.issues ?? []))
        const result = diagnostic(envelope.success ? 'outer_envelope_unparsed' : 'outer_envelope_invalid', issues.length ? issues : [{
            path: 'result.text', message: t('server-ai:ReviewReportDiagnostic.UnparsedEnvelope', {
                defaultValue: 'The outer envelope was not unwrapped by the runner; it is not the delivered inner report.'
            })
        }])
        return innerDiagnostic?.truncated ? { ...result, truncated: true } : result
    }
    return reportDiagnostic(subject, value) ?? diagnostic('report_schema_invalid', [{ path: '$', message: t('server-ai:ReviewReportDiagnostic.ContractMismatch', {
        defaultValue: 'The result does not match the pinned review contract.'
    }) }])
}
