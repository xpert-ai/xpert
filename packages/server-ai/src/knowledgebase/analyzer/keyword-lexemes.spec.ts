import { keywordTsQuery, keywordTsVector } from './keyword-lexemes'

describe('keyword lexeme encoding', () => {
    it('preserves short Chinese terms, identifiers and repeated term positions', () => {
        expect(keywordTsVector(['退款', 'AB-123', '退款'])).toBe("'退款':1,3 'AB-123':2")
        expect(keywordTsQuery(['退款', 'AB-123', '退款'])).toBe("'退款' & 'AB-123'")
    })

    it('quotes terms as data instead of interpreting tsquery operators', () => {
        expect(keywordTsQuery(["a'b", 'x\\y', 'a|b'])).toBe("'a''b' & 'x\\\\y' & 'a|b'")
    })

    it('handles empty analysis without producing an invalid query', () => {
        expect(keywordTsVector([])).toBe('')
        expect(keywordTsQuery([])).toBe('')
    })
})
