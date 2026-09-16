import type { IKnowledgeFAQChunkMetadata } from '@xpert-ai/contracts'
import { t } from 'i18next'
import { normalizeFAQQuestion } from './faq-projection'

export type FAQSemanticPolicy = { threshold: number; margin: number }
export type FAQSemanticDecision = {
    action: 'keep' | 'exclude'
    reason: 'exact_negative' | 'exact_positive' | 'no_negatives' | 'semantic_negative' | 'ambiguous'
    positiveScore?: number
    negativeScore?: number
}
export type FAQQuestions = Pick<
    IKnowledgeFAQChunkMetadata,
    'standardQuestion' | 'similarQuestions' | 'negativeQuestions'
>

export class FAQSemanticError extends Error {
    constructor(readonly reason: 'invalid_vector' | 'model_failed' | 'timeout' | 'invalid_config') {
        super(
            t('server-ai:Error.KnowledgeFAQSemanticUnavailable', {
                defaultValue: 'FAQ semantic exclusion could not be completed.'
            })
        )
        this.name = 'FAQSemanticError'
    }
}

export function matchFAQExactly(query: string, questions: FAQQuestions): FAQSemanticDecision | undefined {
    const identity = normalizeFAQQuestion(query)
    if ((questions.negativeQuestions ?? []).some((text) => normalizeFAQQuestion(text) === identity)) {
        return { action: 'exclude', reason: 'exact_negative' }
    }
    if (
        [questions.standardQuestion, ...questions.similarQuestions].some(
            (text) => normalizeFAQQuestion(text) === identity
        )
    ) {
        return { action: 'keep', reason: 'exact_positive' }
    }
    if (!questions.negativeQuestions?.length) return { action: 'keep', reason: 'no_negatives' }
}

export function isValidFAQVector(value: unknown): value is number[] {
    return (
        Array.isArray(value) &&
        value.length > 0 &&
        value.every((item) => typeof item === 'number' && Number.isFinite(item)) &&
        value.some((item) => item !== 0)
    )
}

export function cosineSimilarity(left: number[], right: number[]): number {
    if (!isValidFAQVector(left) || !isValidFAQVector(right) || left.length !== right.length) {
        throw new FAQSemanticError('invalid_vector')
    }
    const leftNorm = Math.hypot(...left)
    const rightNorm = Math.hypot(...right)
    const score = left.reduce((sum, value, index) => sum + (value / leftNorm) * (right[index] / rightNorm), 0)
    if (!Number.isFinite(score) || !Number.isFinite(leftNorm) || !Number.isFinite(rightNorm)) {
        throw new FAQSemanticError('invalid_vector')
    }
    return Math.max(-1, Math.min(1, score))
}

export function compareFAQVectors(
    query: number[],
    positives: number[][],
    negatives: number[][],
    policy: FAQSemanticPolicy
): FAQSemanticDecision {
    if (!positives.length || !negatives.length) throw new FAQSemanticError('invalid_vector')
    const positiveScore = Math.max(...positives.map((vector) => cosineSimilarity(query, vector)))
    const negativeScore = Math.max(...negatives.map((vector) => cosineSimilarity(query, vector)))
    const exclude = negativeScore >= policy.threshold && negativeScore - positiveScore >= policy.margin
    return {
        action: exclude ? 'exclude' : 'keep',
        reason: exclude ? 'semantic_negative' : 'ambiguous',
        positiveScore,
        negativeScore
    }
}
