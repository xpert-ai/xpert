export const FAQ_RETRIEVAL_LIMITS = {
    rounds: 6,
    candidateSlots: 20_000,
    semanticComparisons: 400,
    questionTexts: 4_000,
    durationMs: 60_000
} as const

export class FAQRetrievalBudget {
    readonly startedAt = Date.now()
    candidateSlots = 0
    retrievalCalls = 0
    comparisons = 0
    questionTexts = 0
    semanticLimited = false

    constructor(readonly limits: { [K in keyof typeof FAQ_RETRIEVAL_LIMITS]: number } = FAQ_RETRIEVAL_LIMITS) {}

    get hasTime() {
        return Date.now() - this.startedAt < this.limits.durationMs
    }

    reserveCandidates(requested: number) {
        if (!this.hasTime) return 0
        const count = requested <= this.limits.candidateSlots - this.candidateSlots ? Math.max(0, requested) : 0
        if (count) {
            this.candidateSlots += count
            this.retrievalCalls++
        }
        return count
    }

    reserveComparison(textCount: number) {
        if (
            !this.hasTime ||
            this.comparisons >= this.limits.semanticComparisons ||
            this.questionTexts + textCount > this.limits.questionTexts
        ) {
            this.semanticLimited = true
            return false
        }
        this.comparisons++
        this.questionTexts += textCount
        return true
    }
}
