import { projectTaskExecutionPurposeSchema } from '@xpert-ai/contracts'
import i18next from 'i18next'
import en from '../../i18n/en.json'
import enUS from '../../i18n/en-US.json'
import zhHans from '../../i18n/zh-Hans.json'
import { reviewReport } from './project-task-evidence'
import { diagnoseReviewReport } from './project-task-review-report-diagnostic'

const invocationId = '11111111-1111-4111-8111-111111111111'
const purpose = projectTaskExecutionPurposeSchema.parse({
    type: 'review', mode: 'execution', candidatePaths: ['plugin'],
    implementationExecutionId: '22222222-2222-4222-8222-222222222222',
    implementationInvocationId: invocationId, specificationDigest: `sha256:${'a'.repeat(64)}`,
    evidence: [{ type: 'invocation_result', invocationId, revision: 3 }]
})
if (purpose.type !== 'review') throw new Error('Invalid fixture')
const report = {
    version: 2, mode: 'execution', verdict: 'pass',
    implementationInvocationId: purpose.implementationInvocationId,
    specificationDigest: purpose.specificationDigest, evidence: purpose.evidence,
    summary: 'Checked the installed plugin', checks: [{ description: 'Invoke plugin', outcome: 'passed', actual: 'Expected response' }],
    findings: [], limitations: []
}
const fence = (value: unknown) => '```xpert-task-result\n' + JSON.stringify(value) + '\n```'

beforeAll(async () => {
    await i18next.init({ lng: 'en', resources: {
        en: { 'server-ai': en }, 'en-US': { 'server-ai': enUS }, 'zh-Hans': { 'server-ai': zhHans }
    } })
})

it.each(['pass', 'changes_required', 'indeterminate'])('preserves an already valid %s report without changing its verdict', (verdict) => {
    const text = JSON.stringify({ ...report, verdict })
    expect(reviewReport(purpose, text)?.verdict).toBe(verdict)
    expect(diagnoseReviewReport(purpose, text)).toBeNull()
})

it('diagnoses an object summary and every unexpected inner field without accepting or rewriting it', () => {
    const text = fence({ version: 1, summary: { ...report,
        implementationExecutionId: purpose.implementationExecutionId, candidateSnapshot: { digest: 'private' }
    }, items: [] })
    const diagnostic = diagnoseReviewReport(purpose, text)
    expect(diagnostic).toEqual({ code: 'outer_envelope_invalid', issues: [
        { path: 'summary', message: 'Expected string; received object.' },
        { path: 'summary.implementationExecutionId', message: expect.stringContaining('Unexpected field') },
        { path: 'summary.candidateSnapshot', message: expect.stringContaining('Unexpected field') }
    ] })
    expect(JSON.stringify(diagnostic)).not.toContain('private')
    expect(reviewReport(purpose, text)).toBeNull()
})

it('does not silently unwrap a valid envelope retained in result.text', () => {
    const text = fence({ version: 1, summary: JSON.stringify(report), items: [] })
    expect(diagnoseReviewReport(purpose, text)?.code).toBe('outer_envelope_unparsed')
    expect(reviewReport(purpose, text)).toBeNull()
})

it('reports envelope, evidence, top-level and finding shape errors together', () => {
    const text = fence({ version: 1, summary: { ...report,
        implementationExecutionId: purpose.implementationExecutionId, candidateSnapshot: {},
        evidence: [{ type: 'invocation_result', invocationId, revision: 4 }],
        findings: [{ id: 'F1', kind: 'defect', blocking: true, severity: 'high', title: 'Actual finding' }]
    }, items: [] })
    const diagnostic = diagnoseReviewReport(purpose, text)
    expect(diagnostic?.issues.map((issue) => issue.path)).toEqual(expect.arrayContaining([
        'summary', 'summary.evidence', 'summary.implementationExecutionId', 'summary.candidateSnapshot',
        'summary.findings.0.description', 'summary.findings.0.severity', 'summary.findings.0.title'
    ]))
    expect(reviewReport(purpose, text)).toBeNull()
})

it.each([
    [undefined, 'missing_report', 'result.text'],
    ['```xpert-task-result\n{broken}\n```', 'invalid_json', 'result.text'],
    [JSON.stringify({ ...report, checks: [{ description: 'Test', outcome: 'passed', actual: 42 }] }), 'report_schema_invalid', 'checks.0.actual'],
    [JSON.stringify({ ...report, specificationDigest: `sha256:${'b'.repeat(64)}` }), 'subject_mismatch', 'specificationDigest'],
    [JSON.stringify({ ...report, implementationInvocationId: '33333333-3333-4333-8333-333333333333' }), 'subject_mismatch', 'implementationInvocationId'],
    [JSON.stringify({ ...report, evidence: [{ type: 'invocation_result', invocationId, revision: 4 }] }), 'evidence_mismatch', 'evidence'],
    [JSON.stringify({ ...report, version: 1 }), 'report_schema_invalid', 'version']
])('diagnoses invalid delivered reports without weakening rejection (%s)', (text, code, path) => {
    expect(diagnoseReviewReport(purpose, text)).toMatchObject({ code, issues: expect.arrayContaining([expect.objectContaining({ path })]) })
    expect(reviewReport(purpose, text)).toBeNull()
})

it('retains report consistency validation and bounds diagnostics without echoing private values', () => {
    const invalid = { ...report, findings: [{ id: 'F1', kind: 'defect', blocking: true, description: 'Private test detail' }] }
    expect(diagnoseReviewReport(purpose, JSON.stringify(invalid))).toMatchObject({ code: 'report_schema_invalid', issues: [
        { path: 'verdict', message: expect.any(String) }
    ] })
    expect(reviewReport(purpose, JSON.stringify(invalid))).toBeNull()
    const text = JSON.stringify({ ...report, ...Object.fromEntries(Array.from({ length: 100 }, (_, i) => [`unknown${i}`, 'SECRET'])) })
    const diagnostic = diagnoseReviewReport(purpose, text)
    expect(diagnostic.issues).toHaveLength(20)
    expect(diagnostic.truncated).toBe(true)
    expect(JSON.stringify(diagnostic)).not.toContain('SECRET')
})

it('preserves evidence-only version 1 compatibility', () => {
    const evidencePurpose = projectTaskExecutionPurposeSchema.parse({ ...purpose, mode: 'evidence_only', candidatePaths: undefined })
    const text = JSON.stringify({ version: 1, verdict: 'pass', implementationInvocationId: invocationId,
        specificationDigest: purpose.specificationDigest, evidence: purpose.evidence,
        findings: ['The supplied evidence supports the requirement'], limitations: ['No independent execution'] })
    expect(reviewReport(evidencePurpose, text)?.version).toBe(1)
    expect(diagnoseReviewReport(evidencePurpose, text)).toBeNull()
})

it('distinguishes evidence order from different references while retaining order-sensitive rejection', () => {
    const artifact = { type: 'artifact', artifactId: '33333333-3333-4333-8333-333333333333',
        versionId: '44444444-4444-4444-8444-444444444444' }
    const subject = projectTaskExecutionPurposeSchema.parse({ ...purpose, evidence: [...purpose.evidence, artifact] })
    const text = JSON.stringify({ ...report, evidence: [artifact, ...purpose.evidence] })
    expect(diagnoseReviewReport(subject, text)).toMatchObject({ code: 'evidence_order_mismatch', issues: [
        { path: 'evidence', code: 'evidence_order_mismatch', message: expect.stringContaining('references match') }
    ] })
    expect(reviewReport(subject, text)).toBeNull()
    const different = JSON.stringify({ ...report, evidence: [artifact, artifact] })
    expect(diagnoseReviewReport(subject, different)?.code).toBe('evidence_mismatch')
    expect(reviewReport(subject, different)).toBeNull()
})

it('does not disclose rejected enum values, literal values or finding text', () => {
    const text = JSON.stringify({ ...report, version: 'PRIVATE_VERSION', verdict: 'PRIVATE_VERDICT',
        findings: [{ id: 'F1', kind: 'PRIVATE_KIND', blocking: true, description: 'PRIVATE_FINDING' }] })
    const diagnostic = diagnoseReviewReport(purpose, text)
    expect(diagnostic?.issues.map((issue) => issue.path)).toEqual(expect.arrayContaining(['version', 'verdict', 'findings.0.kind']))
    expect(JSON.stringify(diagnostic)).not.toContain('PRIVATE_')
})

it('bounds unknown field paths and messages, including nested envelope diagnostics', () => {
    const text = fence({ version: 1, summary: { ...report,
        ...Object.fromEntries(Array.from({ length: 40 }, (_, index) => [`${index}${'x'.repeat(500)}`, 'PRIVATE']))
    }, items: [] })
    const diagnostic = diagnoseReviewReport(purpose, text)
    expect(diagnostic?.truncated).toBe(true)
    expect(diagnostic?.issues).toHaveLength(20)
    expect(diagnostic?.issues.every((issue) => issue.path.length <= 8 * 81 + 'summary'.length && issue.message.length <= 240)).toBe(true)
    expect(JSON.stringify(diagnostic)).not.toContain('PRIVATE')
})

it('diagnoses invalid pinned subjects and ignores implementation purposes', () => {
    expect(diagnoseReviewReport({ ...purpose, specificationDigest: 'invalid' }, JSON.stringify(report))?.code).toBe('invalid_subject')
    expect(diagnoseReviewReport({ type: 'implementation' }, 'Ordinary result')).toBeNull()
})

it.each(['en', 'en-US', 'zh-Hans'])('localizes diagnostics without changing codes or paths in %s', async (language) => {
    await i18next.changeLanguage(language)
    try {
        const diagnostic = diagnoseReviewReport(purpose, fence({ version: 1, summary: report, items: [] }))
        expect(diagnostic).toMatchObject({ code: 'outer_envelope_invalid', issues: [{ path: 'summary',
            message: language === 'zh-Hans' ? '应为 string，实际类型为 object。' : 'Expected string; received object.' }] })
        const missing = diagnoseReviewReport(purpose)
        expect(missing?.issues[0].message).toContain(language === 'zh-Hans' ? '尚未交付' : 'no delivered')
        const resource = language === 'en' ? en : language === 'en-US' ? enUS : zhHans
        expect(Object.keys(resource.ReviewReportDiagnostic).sort()).toEqual(Object.keys(en.ReviewReportDiagnostic).sort())
        expect(Object.values(resource.ReviewReportDiagnostic).every((message) => message.length > 0)).toBe(true)
        expect(JSON.stringify(diagnostic)).not.toContain('server-ai:')
    } finally {
        await i18next.changeLanguage('en')
    }
})
