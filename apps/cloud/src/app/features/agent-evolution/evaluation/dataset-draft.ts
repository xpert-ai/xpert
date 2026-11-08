import type { GoldenCaseRevision } from '@xpert-ai/contracts'

export interface CaseDraft {
  caseId: string
  revision: number | null
  input: string
  expected: string
  slice: string
  risk: string
  evidenceRef: string
  malformed?: boolean
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function emptyCase(): CaseDraft {
  return { caseId: '', revision: 1, input: '{}', expected: '{}', slice: 'stable', risk: 'medium', evidenceRef: '' }
}

function importedCase(value: unknown): CaseDraft {
  if (!isObject(value)) return { ...emptyCase(), malformed: true }
  return {
    caseId: typeof value.caseId === 'string' ? value.caseId : '',
    revision: typeof value.revision === 'number' ? value.revision : null,
    input: JSON.stringify(value.input, null, 2) ?? '',
    expected: JSON.stringify(value.expected, null, 2) ?? '',
    slice: typeof value.slice === 'string' ? value.slice : 'stable',
    risk: typeof value.risk === 'string' ? value.risk : '',
    evidenceRef: typeof value.evidenceRef === 'string' ? value.evidenceRef : ''
  }
}

export function importCases(text: string): CaseDraft[] {
  const value: unknown = JSON.parse(text.replace(/^\uFEFF/, ''))
  if (!Array.isArray(value) || !value.length) throw new RangeError('EmptyArray')
  return value.map(importedCase)
}

function scalarRecord(text: string): GoldenCaseRevision['input'] | null {
  try {
    const value: unknown = JSON.parse(text)
    if (!isObject(value)) return null
    const entries: [string, string | number | boolean][] = []
    for (const [key, item] of Object.entries(value)) {
      if (
        typeof item === 'string' ||
        typeof item === 'boolean' ||
        (typeof item === 'number' && Number.isFinite(item))
      ) {
        entries.push([key, item])
      } else return null
    }
    return Object.fromEntries(entries)
  } catch {
    return null
  }
}

type Problem =
  | 'InvalidObject'
  | 'InvalidIdentity'
  | 'InvalidRevision'
  | 'InvalidInput'
  | 'InvalidExpected'
  | 'InvalidRisk'
  | 'Duplicate'
function inspectCase(draft: CaseDraft, seen: Map<string, number>, index: number) {
  const input = scalarRecord(draft.input),
    expected = scalarRecord(draft.expected)
  const risk = draft.risk
  const errors: Problem[] = []
  let duplicateOf: number | undefined
  if (draft.malformed) errors.push('InvalidObject')
  if (!draft.caseId.trim()) errors.push('InvalidIdentity')
  if (draft.revision === null || !Number.isSafeInteger(draft.revision)) errors.push('InvalidRevision')
  if (!input) errors.push('InvalidInput')
  if (!expected) errors.push('InvalidExpected')
  if (risk !== 'low' && risk !== 'medium' && risk !== 'high') errors.push('InvalidRisk')
  if (draft.caseId.trim() && draft.revision !== null) {
    const identity = JSON.stringify([draft.caseId, draft.revision])
    duplicateOf = seen.get(identity)
    if (duplicateOf !== undefined) errors.push('Duplicate')
    else seen.set(identity, index)
  }
  const value: GoldenCaseRevision | null =
    !errors.length &&
    input &&
    expected &&
    draft.revision !== null &&
    (risk === 'low' || risk === 'medium' || risk === 'high')
      ? {
          caseId: draft.caseId,
          revision: draft.revision,
          input,
          expected,
          slice: draft.slice || 'stable',
          risk,
          evidenceRef: draft.evidenceRef || 'manual://' + draft.caseId
        }
      : null
  return { index, draft, input, expected, value, errors, duplicateOf }
}

export function inspectDataset(drafts: CaseDraft[]) {
  const seen = new Map<string, number>()
  const rows = drafts.map((draft, index) => inspectCase(draft, seen, index))
  const cases = rows.flatMap((r) => (r.value ? [r.value] : []))
  return {
    rows,
    cases,
    valid: cases.length > 0 && cases.length === rows.length,
    problems: rows.filter((r) => r.errors.length),
    affected: drafts.filter((d) => /^affected($|:|_)/.test(d.slice)).length,
    highRisk: drafts.filter((d) => d.risk === 'high').length
  }
}
