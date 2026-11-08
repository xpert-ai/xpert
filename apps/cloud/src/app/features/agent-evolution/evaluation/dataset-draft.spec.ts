import { importCases, inspectDataset } from './dataset-draft'

const example = {
  caseId: 'first',
  revision: 1,
  input: { count: 2, enabled: false },
  expected: { outcome: 'refund' },
  slice: 'affected:refund',
  risk: 'high',
  evidenceRef: 'ref:1'
}
function analyze(values: unknown[]) {
  return inspectDataset(importCases(JSON.stringify(values)))
}

describe('dataset snapshot drafts', () => {
  it('keeps valid rows and scalar types when another row needs repair', () => {
    const imported = importCases(
      '\uFEFF' + JSON.stringify([example, { ...example, caseId: 'second', risk: 'invalid', input: { nested: [1] } }])
    )
    const mistaken = inspectDataset(imported)
    expect(mistaken.valid).toBe(false)
    expect(mistaken.problems.map((p) => [p.index, p.errors])).toEqual([[1, ['InvalidInput', 'InvalidRisk']]])
    imported[1] = { ...imported[1], input: '{"value":false}', risk: 'medium' }
    const fixed = inspectDataset(imported)
    expect(fixed.valid).toBe(true)
    expect(fixed.cases).toEqual([example, { ...example, caseId: 'second', risk: 'medium', input: { value: false } }])
  })
  it('requires unique case and revision pairs and defaults omitted slice and evidence', () => {
    const second = { ...example, revision: 2, slice: undefined, evidenceRef: undefined }
    const result = analyze([example, second, { ...second }])
    expect(result.problems.map((p) => [p.index, p.duplicateOf])).toEqual([[2, 1]])
    expect(result.cases[1]).toMatchObject({ revision: 2, slice: 'stable', evidenceRef: 'manual://first' })
  })
  it('keeps malformed rows addressable and distinguishes freeze eligibility from replay thresholds', () => {
    expect(analyze([null, { ...example, revision: '1' }]).problems.map((p) => p.index)).toEqual([0, 1])
    const result = analyze([
      example,
      { ...example, caseId: 'second', slice: 'affected_refund' },
      { ...example, caseId: 'third', slice: 'affected' }
    ])
    expect(result.valid).toBe(true)
    expect(result.affected).toBe(3)
    expect(() => importCases('{}')).toThrow(RangeError)
    expect(() => importCases('[')).toThrow(SyntaxError)
  })
})
