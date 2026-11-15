import { analysisEvidenceDigestInput, parseAnalysisEvidence } from './analysis-evidence'
const id = '00000000-0000-4000-8000-000000000001'
const fixture = () => ({
  schema: 'xpert.analysis-evidence@1',
  id,
  title: 'Revenue',
  capturedAt: '2026-11-12T00:00:00.000Z',
  source: { artifactId: id, versionId: id, projectId: id },
  controls: {},
  sha256: 'a'.repeat(64),
  datasets: [
    {
      schema: 'xpert.analytics.dataset',
      datasetId: 'sales',
      fields: [
        {
          id: 'amount',
          label: 'Revenue',
          sourceField: 'amount',
          role: 'measure',
          logicalType: 'float64',
          nullable: false,
          unit: 'CNY'
        }
      ],
      rows: [{ amount: 3500 }],
      grain: [],
      completeness: {
        returnedRows: 1,
        totalRows: 1,
        totalAccuracy: 'exact',
        scope: 'full_query_result',
        truncated: false
      },
      freshness: { executedAt: '2026-11-12T00:00:00.000Z', sourceFetchedAt: '2026-11-12T00:00:00.000Z' },
      provenance: { executionId: 'run', bindingId: 'binding', providerId: 'file.table' }
    }
  ],
  statements: [
    { kind: 'fact', text: 'Revenue: 3500 CNY', citations: [{ datasetId: 'sales', row: 0, field: 'amount' }] }
  ]
})
describe('immutable analysis evidence boundary', () => {
  it('preserves typed cells, units and source identity', () => {
    const result = parseAnalysisEvidence(fixture())
    expect(result.datasets[0].rows[0].amount).toBe(3500)
    expect(result.datasets[0].fields[0].unit).toBe('CNY')
    expect(parseAnalysisEvidence(JSON.parse(JSON.stringify(result)))).toEqual(result)
  })
  it.each(['query', 'credentials', 'sql'])('rejects undeclared sensitive field %s', (field) => {
    expect(() => parseAnalysisEvidence({ ...fixture(), [field]: 'sensitive' })).toThrow()
  })
  it('rejects missing, wrong-typed, unreferenced and inconsistent cells', () => {
    const row = fixture()
    row.datasets[0].rows = []
    expect(() => parseAnalysisEvidence(row)).toThrow()
    const citation = fixture()
    citation.statements[0].citations[0].row = 1
    expect(() => parseAnalysisEvidence(citation)).toThrow()
    const fact = fixture()
    fact.statements[0].citations = []
    expect(() => parseAnalysisEvidence(fact)).toThrow()
    const complete = fixture()
    complete.datasets[0].completeness.totalRows = 0
    expect(() => parseAnalysisEvidence(complete)).toThrow()
    const data = fixture()
    expect(() =>
      parseAnalysisEvidence({ ...data, datasets: [{ ...data.datasets[0], rows: [{ amount: '3500' }] }] })
    ).toThrow()
  })
  it('canonicalizes key ordering but retains values, capture time and statement classification', () => {
    const value = parseAnalysisEvidence(fixture()),
      reordered = { ...value, controls: { b: 2, a: 1 } }
    expect(analysisEvidenceDigestInput(reordered)).toBe(
      analysisEvidenceDigestInput({ ...reordered, controls: { a: 1, b: 2 } })
    )
    expect(analysisEvidenceDigestInput(value)).not.toBe(
      analysisEvidenceDigestInput({ ...value, capturedAt: '2026-11-13T00:00:00.000Z' })
    )
    expect(analysisEvidenceDigestInput(value)).not.toContain('"sha256"')
  })

  it.each([
    ['int64', '9223372036854775808'],
    ['int64', '-9223372036854775809'],
    ['date', '2026-02-30'],
    ['timestamp', '2026-02-30T00:00:00Z'],
    ['timestamp', '2026-11-12T00:00:00']
  ])('rejects invalid %s cells using the query result rules', (logicalType, amount) => {
    const value = fixture()
    value.datasets[0].fields[0].logicalType = logicalType
    expect(() =>
      parseAnalysisEvidence({
        ...value,
        datasets: [{ ...value.datasets[0], rows: [{ amount }] }]
      })
    ).toThrow()
  })

  it.each([
    ['int64', '9223372036854775807'],
    ['int64', '-9223372036854775808'],
    ['decimal', '9007199254740993.1234567890123456789'],
    ['decimal', '1.' + '2'.repeat(150)],
    ['date', '2024-02-29'],
    ['timestamp', '2026-11-12T08:00:00+08:00']
  ])('preserves exact %s cells through serialization', (logicalType, amount) => {
    const value = fixture()
    value.datasets[0].fields[0].logicalType = logicalType
    const parsed = parseAnalysisEvidence({
      ...value,
      datasets: [{ ...value.datasets[0], rows: [{ amount }] }]
    })
    expect(parsed.datasets[0].rows[0].amount).toBe(amount)
    expect(parseAnalysisEvidence(JSON.parse(JSON.stringify(parsed)))).toEqual(parsed)
  })

  it('requires explicit nullability and rejects extra cells', () => {
    const value = fixture()
    const nullable = { ...value.datasets[0], rows: [{ amount: null }] }
    expect(() => parseAnalysisEvidence({ ...value, datasets: [nullable] })).toThrow()
    nullable.fields[0].nullable = true
    expect(parseAnalysisEvidence({ ...value, datasets: [nullable] }).datasets[0].rows[0].amount).toBeNull()
    expect(() =>
      parseAnalysisEvidence({
        ...value,
        datasets: [{ ...value.datasets[0], rows: [{ amount: 3500, credentials: 'secret' }] }]
      })
    ).toThrow()
  })

  it('rejects ambiguous datasets and fields before resolving cell citations', () => {
    const value = fixture()
    expect(() => parseAnalysisEvidence({ ...value, datasets: [value.datasets[0], value.datasets[0]] })).toThrow()
    value.datasets[0].fields.push(value.datasets[0].fields[0])
    expect(() => parseAnalysisEvidence(value)).toThrow()
  })

  it('preserves unverified source status without accepting approval-only fields', () => {
    const value = fixture()
    const certification = {
      kind: 'business_metric',
      subjectId: 'metric',
      status: 'legacy_unverified',
      verifiedAt: value.capturedAt
    }
    const withProof = (proof: unknown) => ({
      ...value,
      datasets: [{ ...value.datasets[0], provenance: { ...value.datasets[0].provenance, certification: proof } }]
    })
    expect(parseAnalysisEvidence(withProof(certification)).datasets[0].provenance.certification).toEqual(certification)
    expect(() => parseAnalysisEvidence(withProof({ ...certification, certifiedBy: 'author' }))).toThrow()
    expect(() => parseAnalysisEvidence(withProof({ ...certification, status: 'verified' }))).toThrow()
  })

  it('bounds encoded evidence size without truncating cells', () => {
    const value = fixture()
    value.datasets[0].fields[0].logicalType = 'string'
    const rows = Array.from({ length: 700 }, () => ({ amount: '界'.repeat(1000) }))
    const dataset = {
      ...value.datasets[0],
      rows,
      completeness: { ...value.datasets[0].completeness, returnedRows: rows.length, totalRows: rows.length }
    }
    expect(() => parseAnalysisEvidence({ ...value, datasets: [dataset] })).toThrow('Evidence exceeds limit')
  })
})
