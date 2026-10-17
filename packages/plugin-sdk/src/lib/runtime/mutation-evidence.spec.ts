import { createMutationEvidence } from './mutation-evidence'
describe('mutation completion evidence', () => {
  it('requires a commit for the latest write, rejecting earlier concurrent receipts', () => {
    const evidence = createMutationEvidence<string>()
    const first = evidence.begin(),
      second = evidence.begin()
    evidence.accept(first, 'old')
    expect(evidence.pending).toBe(true)
    evidence.accept(second, 'saved r2')
    expect(evidence.pending).toBe(false)
    evidence.begin()
    expect(evidence.pending).toBe(true)
  })
})
