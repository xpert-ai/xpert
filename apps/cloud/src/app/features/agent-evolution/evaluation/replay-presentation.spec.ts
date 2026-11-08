import type { EvaluationRun, ReplayCaseResult } from '@xpert-ai/contracts'
import { caseOutcome, filterCases } from './replay-presentation'

describe('paired replay outcomes', () => {
  const pair = (baselinePassed: boolean, candidatePassed: boolean, severeError: boolean) =>
    ({ baselinePassed, candidatePassed, severeError }) as ReplayCaseResult
  const cases = [pair(false, true, false), pair(true, true, false), pair(true, false, false), pair(false, false, true)]
  const run = { caseResults: cases } as EvaluationRun
  it('keeps a severe pre-existing failure distinct from a regression', () => {
    expect(cases.map(caseOutcome)).toEqual(['improved', 'kept', 'regressed', 'failed'])
    expect(filterCases(run, 'regressed')).toEqual([cases[2]])
    expect(filterCases(run, 'failed')).toEqual([cases[3]])
    expect(filterCases(run, 'severe')).toEqual([cases[3]])
  })
})
