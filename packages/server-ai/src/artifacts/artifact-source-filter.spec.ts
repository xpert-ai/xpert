import { artifactResourcePrefixPattern } from './artifact-source-filter'

describe('Artifact literal source prefix', () => {
    it('does not treat underscore, percent or escape characters as wildcards', () => {
        expect(artifactResourcePrefixPattern('agent/a_b%\\/')).toBe('agent/a\\_b\\%\\\\/%')
        expect(artifactResourcePrefixPattern('agent/id/')).toBe('agent/id/%')
    })
})
