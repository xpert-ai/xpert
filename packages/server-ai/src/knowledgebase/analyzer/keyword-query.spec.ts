import { keywordIdentifiers, keywordQueryPlan } from './keyword-query'

jest.mock('i18next', () => ({ t: (_key: string, options: { defaultValue: string }) => options.defaultValue }))

describe('keyword query planning', () => {
    it('uses lexical features before normalization instead of domain lists', () => {
        expect(
            keywordIdentifiers('XPERT_LOCAL_SANDBOX_ENABLED PR980 LSJWR4095RS105767 404 mixedCase ab-cd AI 退款')
        ).toEqual(['XPERT_LOCAL_SANDBOX_ENABLED', 'PR980', 'LSJWR4095RS105767', '404', 'mixedCase', 'ab-cd', 'AI'])
        expect(keywordIdentifiers('如何 申请 退款 ordinary words')).toEqual([])
        expect(keywordIdentifiers('PR980如何开启')).toEqual(['PR980'])
    })

    it('never relaxes into one ordinary term or drops a short term by length', () => {
        expect(keywordQueryPlan(['申请', '退款']).relaxed).toBeUndefined()
        for (const term of ['退款', 'AI', 'C', 'Go']) {
            expect(keywordQueryPlan([term])).toEqual({
                strict: `('${term}')`,
                groups: [`'${term}'`],
                relaxed: undefined
            })
        }
    })

    it('groups only complete overlapping decompositions', () => {
        const plan = keywordQueryPlan(['人工', '智能', '人工智能', '技术'])
        expect(plan.groups).toHaveLength(2)
        expect(plan.strict).toContain("'人工智能' | ('人工' & '智能')")
        expect(plan.relaxed).toBeUndefined()
        expect(keywordQueryPlan(['he', 'the']).groups).toHaveLength(2)
    })

    it('keeps long queries strict and fails closed when an analyzer drops a protected identifier', () => {
        expect(keywordQueryPlan(Array.from({ length: 13 }, (_, i) => `term${i}`)).relaxed).toBeUndefined()
        expect(keywordQueryPlan(['如何', '开启'], [[]])).toEqual({ strict: '', groups: [] })
    })

    it('rejects oversized queries rather than silently dropping exact identifiers', () => {
        expect(() => keywordQueryPlan(Array.from({ length: 65 }, (_, i) => `term${i}`))).toThrow('64')
    })
})
