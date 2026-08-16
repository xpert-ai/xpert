import { assertCandidateTransition, assertReleaseTransition } from './evolution-state'

describe('evolution state machines', () => {
    it('accepts the governed happy-path transitions', () => {
        expect(() => assertCandidateTransition('ready', 'evaluating')).not.toThrow()
        expect(() => assertCandidateTransition('pending_approval', 'approved')).not.toThrow()
        expect(() => assertReleaseTransition('installed', 'shadow')).not.toThrow()
        expect(() => assertReleaseTransition('canary', 'active')).not.toThrow()
    })

    it('rejects shortcuts that bypass evaluation or installation', () => {
        expect(() => assertCandidateTransition('ready', 'approved')).toThrow('Illegal candidate transition')
        expect(() => assertReleaseTransition('approved', 'active')).toThrow('Illegal release transition')
    })
})
