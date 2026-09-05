import {
    KNOWLEDGE_FAQ_ANSWER_BLOCK_MAX_COUNT,
    KNOWLEDGE_FAQ_ANSWER_TOTAL_MAX_LENGTH,
    KNOWLEDGE_FAQ_NEGATIVE_QUESTION_MAX_COUNT,
    KNOWLEDGE_FAQ_NEGATIVE_QUESTION_MAX_LENGTH,
    KNOWLEDGE_FAQ_SIMILAR_QUESTION_MAX_COUNT,
    KNOWLEDGE_FAQ_SIMILAR_QUESTION_MAX_LENGTH,
    KNOWLEDGE_FAQ_STANDARD_QUESTION_MAX_LENGTH,
    KnowledgeFAQWriteInput
} from '@xpert-ai/contracts'
import { NormalizedFAQInput, normalizeFAQInput, normalizeFAQQuestion } from './faq-projection'

export type FAQInputValidationCode =
    | 'standard_question_required'
    | 'standard_question_too_long'
    | 'too_many_similar_questions'
    | 'similar_question_required'
    | 'similar_question_too_long'
    | 'too_many_negative_questions'
    | 'negative_question_required'
    | 'negative_question_too_long'
    | 'duplicate_negative_question'
    | 'negative_question_conflicts_with_positive'
    | 'answer_required'
    | 'too_many_answer_blocks'
    | 'answer_block_required'
    | 'answer_too_long'
    | 'duplicate_question'

export class FAQInputValidationError extends Error {
    constructor(
        readonly code: FAQInputValidationCode,
        readonly field: 'standardQuestion' | 'similarQuestions' | 'negativeQuestions' | 'answerBlocks',
        readonly conflictingFAQId?: string
    ) {
        super(code)
        this.name = 'FAQInputValidationError'
    }
}

type ExistingFAQQuestions = {
    id: string
    standardQuestion: string
    similarQuestions: string[]
    enabled: boolean
}

function countCharacters(value: string) {
    return Array.from(value).length
}

export function validateAndNormalizeFAQInput(input: KnowledgeFAQWriteInput): NormalizedFAQInput {
    const normalized = normalizeFAQInput(input)
    if (!normalized.standardQuestion) {
        throw new FAQInputValidationError('standard_question_required', 'standardQuestion')
    }
    if (countCharacters(normalized.standardQuestion) > KNOWLEDGE_FAQ_STANDARD_QUESTION_MAX_LENGTH) {
        throw new FAQInputValidationError('standard_question_too_long', 'standardQuestion')
    }
    if (normalized.similarQuestions.length > KNOWLEDGE_FAQ_SIMILAR_QUESTION_MAX_COUNT) {
        throw new FAQInputValidationError('too_many_similar_questions', 'similarQuestions')
    }
    for (const question of normalized.similarQuestions) {
        if (!question) {
            throw new FAQInputValidationError('similar_question_required', 'similarQuestions')
        }
        if (countCharacters(question) > KNOWLEDGE_FAQ_SIMILAR_QUESTION_MAX_LENGTH) {
            throw new FAQInputValidationError('similar_question_too_long', 'similarQuestions')
        }
    }
    if (normalized.negativeQuestions.length > KNOWLEDGE_FAQ_NEGATIVE_QUESTION_MAX_COUNT) {
        throw new FAQInputValidationError('too_many_negative_questions', 'negativeQuestions')
    }
    for (const question of normalized.negativeQuestions) {
        if (!question) {
            throw new FAQInputValidationError('negative_question_required', 'negativeQuestions')
        }
        if (countCharacters(question) > KNOWLEDGE_FAQ_NEGATIVE_QUESTION_MAX_LENGTH) {
            throw new FAQInputValidationError('negative_question_too_long', 'negativeQuestions')
        }
    }
    if (!normalized.answerBlocks.length) {
        throw new FAQInputValidationError('answer_required', 'answerBlocks')
    }
    if (normalized.answerBlocks.length > KNOWLEDGE_FAQ_ANSWER_BLOCK_MAX_COUNT) {
        throw new FAQInputValidationError('too_many_answer_blocks', 'answerBlocks')
    }
    if (normalized.answerBlocks.some((answer) => !answer)) {
        throw new FAQInputValidationError('answer_block_required', 'answerBlocks')
    }
    if (countCharacters(normalized.answerBlocks.join('')) > KNOWLEDGE_FAQ_ANSWER_TOTAL_MAX_LENGTH) {
        throw new FAQInputValidationError('answer_too_long', 'answerBlocks')
    }

    const identities = [normalized.standardQuestion, ...normalized.similarQuestions].map(normalizeFAQQuestion)
    if (new Set(identities).size !== identities.length) {
        throw new FAQInputValidationError('duplicate_question', 'similarQuestions')
    }
    const negativeIdentities = normalized.negativeQuestions.map(normalizeFAQQuestion)
    if (new Set(negativeIdentities).size !== negativeIdentities.length) {
        throw new FAQInputValidationError('duplicate_negative_question', 'negativeQuestions')
    }
    const positiveIdentities = new Set(identities)
    if (negativeIdentities.some((identity) => positiveIdentities.has(identity))) {
        throw new FAQInputValidationError('negative_question_conflicts_with_positive', 'negativeQuestions')
    }
    return normalized
}

export function assertFAQQuestionUniqueness(
    candidate: NormalizedFAQInput,
    existingFAQs: ExistingFAQQuestions[],
    excludedFAQId?: string
) {
    const candidateIdentities = new Set(
        [candidate.standardQuestion, ...candidate.similarQuestions].map(normalizeFAQQuestion)
    )
    for (const faq of existingFAQs) {
        if (faq.id === excludedFAQId) continue
        const hasDuplicate = [faq.standardQuestion, ...faq.similarQuestions]
            .map(normalizeFAQQuestion)
            .some((identity) => candidateIdentities.has(identity))
        if (hasDuplicate) {
            throw new FAQInputValidationError('duplicate_question', 'similarQuestions', faq.id)
        }
    }
}
