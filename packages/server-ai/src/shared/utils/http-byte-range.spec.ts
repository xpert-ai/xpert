import { resolveHttpByteRange } from './http-byte-range'

describe('resolveHttpByteRange', () => {
    it('returns the full representation without a Range header', () => {
        expect(resolveHttpByteRange(undefined, 1_000)).toEqual({ kind: 'full' })
    })

    it('supports open-ended ranges used by browser media elements', () => {
        expect(resolveHttpByteRange('bytes=100-', 1_000)).toEqual({
            kind: 'partial',
            start: 100,
            end: 999
        })
    })

    it('supports bounded and suffix ranges', () => {
        expect(resolveHttpByteRange('bytes=100-199', 1_000)).toEqual({
            kind: 'partial',
            start: 100,
            end: 199
        })
        expect(resolveHttpByteRange('bytes=-250', 1_000)).toEqual({
            kind: 'partial',
            start: 750,
            end: 999
        })
    })

    it('caps an oversized end offset at the final byte', () => {
        expect(resolveHttpByteRange('bytes=900-2000', 1_000)).toEqual({
            kind: 'partial',
            start: 900,
            end: 999
        })
    })

    it.each(['bytes=1000-', 'bytes=200-100', 'bytes=-0', 'bytes=0-1,3-4', 'items=0-10'])(
        'rejects an unsatisfiable range: %s',
        (rangeHeader) => {
            expect(resolveHttpByteRange(rangeHeader, 1_000)).toEqual({ kind: 'unsatisfiable' })
        }
    )
})
