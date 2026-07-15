import { normalizeFileSize } from './utils'

describe('knowledge workbench utils', () => {
    it('normalizes persisted string file sizes to bytes', () => {
        expect(normalizeFileSize('4114081')).toBe(4_114_081)
    })

    it('keeps valid numeric file sizes', () => {
        expect(normalizeFileSize(4_114_081)).toBe(4_114_081)
    })

    it('rejects invalid file sizes', () => {
        expect(normalizeFileSize('4 MB')).toBeUndefined()
        expect(normalizeFileSize(-1)).toBeUndefined()
    })
})
