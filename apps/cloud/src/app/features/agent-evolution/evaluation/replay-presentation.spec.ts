import type { ReplayCaseResult } from '@xpert-ai/contracts'
import { caseOutcome, filterCases } from './replay-presentation'

describe('paired replay outcomes', () => {
  const pair = (baselinePassed: boolean, candidatePassed: boolean, severeError: boolean) =>
    ({ baselinePassed, candidatePassed, severeError }) as ReplayCaseResult
  const cases = [pair(false, true, false), pair(true, true, false), pair(true, false, false), pair(false, false, true)]
  it('keeps a severe pre-existing failure distinct from a regression', () => {
    expect(cases.map(caseOutcome)).toEqual(['improved', 'kept', 'regressed', 'failed'])
    expect(filterCases(cases, 'regressed')).toEqual([cases[2]])
    expect(filterCases(cases, 'failed')).toEqual([cases[3]])
    expect(filterCases(cases, 'severe')).toEqual([cases[3]])
  })
})
