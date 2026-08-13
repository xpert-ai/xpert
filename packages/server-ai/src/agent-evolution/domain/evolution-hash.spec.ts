import { canonicalEvolutionJson, hashEvolutionValue } from './evolution-hash'

describe('evolution hash', () => {
    it('canonicalizes object keys before hashing immutable artifacts', () => {
        expect(canonicalEvolutionJson({ z: 1, a: { d: true, b: 'value' } })).toBe('{"a":{"b":"value","d":true},"z":1}')
        expect(hashEvolutionValue({ z: 1, a: 2 })).toBe(hashEvolutionValue({ a: 2, z: 1 }))
    })
})
