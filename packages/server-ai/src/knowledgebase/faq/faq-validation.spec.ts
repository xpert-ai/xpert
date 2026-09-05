import {
    KNOWLEDGE_FAQ_ANSWER_BLOCK_MAX_COUNT,
    KNOWLEDGE_FAQ_ANSWER_TOTAL_MAX_LENGTH,
    KNOWLEDGE_FAQ_NEGATIVE_QUESTION_MAX_COUNT,
    KNOWLEDGE_FAQ_NEGATIVE_QUESTION_MAX_LENGTH,
    KNOWLEDGE_FAQ_SIMILAR_QUESTION_MAX_COUNT,
    KNOWLEDGE_FAQ_SIMILAR_QUESTION_MAX_LENGTH,
    KNOWLEDGE_FAQ_STANDARD_QUESTION_MAX_LENGTH
} from '@xpert-ai/contracts'
import { assertFAQQuestionUniqueness, FAQInputValidationError, validateAndNormalizeFAQInput } from './faq-validation'

describe('FAQ validation', () => {
    const validInput = {
        standardQuestion: '如何重置密码？',
        similarQuestions: ['忘记密码怎么办？'],
        answerBlocks: ['打开设置页面。'],
        enabled: true
    }

    it('counts Unicode code points for question limits', () => {
        const accepted = validateAndNormalizeFAQInput({
            ...validInput,
            standardQuestion: '😀'.repeat(KNOWLEDGE_FAQ_STANDARD_QUESTION_MAX_LENGTH)
        })
        expect(Array.from(accepted.standardQuestion)).toHaveLength(KNOWLEDGE_FAQ_STANDARD_QUESTION_MAX_LENGTH)

        expect(() =>
            validateAndNormalizeFAQInput({
                ...validInput,
                standardQuestion: '😀'.repeat(KNOWLEDGE_FAQ_STANDARD_QUESTION_MAX_LENGTH + 1)
            })
        ).toThrow(expect.objectContaining({ code: 'standard_question_too_long' }))
    })

    it('limits similar questions by count and per-item length', () => {
        expect(() =>
            validateAndNormalizeFAQInput({
                ...validInput,
                similarQuestions: Array.from(
                    { length: KNOWLEDGE_FAQ_SIMILAR_QUESTION_MAX_COUNT + 1 },
                    (_, index) => `相似问法 ${index}`
                )
            })
        ).toThrow(expect.objectContaining({ code: 'too_many_similar_questions' }))

        expect(() =>
            validateAndNormalizeFAQInput({
                ...validInput,
                similarQuestions: ['问'.repeat(KNOWLEDGE_FAQ_SIMILAR_QUESTION_MAX_LENGTH + 1)]
            })
        ).toThrow(expect.objectContaining({ code: 'similar_question_too_long' }))
    })

    it('limits negative questions by count and per-item length', () => {
        expect(() =>
            validateAndNormalizeFAQInput({
                ...validInput,
                negativeQuestions: Array.from(
                    { length: KNOWLEDGE_FAQ_NEGATIVE_QUESTION_MAX_COUNT + 1 },
                    (_, index) => `反例 ${index}`
                )
            })
        ).toThrow(expect.objectContaining({ code: 'too_many_negative_questions' }))

        expect(() =>
            validateAndNormalizeFAQInput({
                ...validInput,
                negativeQuestions: ['问'.repeat(KNOWLEDGE_FAQ_NEGATIVE_QUESTION_MAX_LENGTH + 1)]
            })
        ).toThrow(expect.objectContaining({ code: 'negative_question_too_long' }))
    })

    it('rejects duplicate negative questions and conflicts with positive questions', () => {
        expect(() =>
            validateAndNormalizeFAQInput({
                ...validInput,
                negativeQuestions: ['不相关的问题', ' 不相关的问题 ']
            })
        ).toThrow(expect.objectContaining({ code: 'duplicate_negative_question' }))

        expect(() =>
            validateAndNormalizeFAQInput({
                ...validInput,
                negativeQuestions: [' 忘记密码怎么办? ']
            })
        ).toThrow(expect.objectContaining({ code: 'negative_question_conflicts_with_positive' }))
    })

    it('requires one to five non-empty answer blocks and caps their total length', () => {
        expect(() => validateAndNormalizeFAQInput({ ...validInput, answerBlocks: [] })).toThrow(
            expect.objectContaining({ code: 'answer_required' })
        )
        expect(() =>
            validateAndNormalizeFAQInput({
                ...validInput,
                answerBlocks: Array.from({ length: KNOWLEDGE_FAQ_ANSWER_BLOCK_MAX_COUNT + 1 }, () => '回答')
            })
        ).toThrow(expect.objectContaining({ code: 'too_many_answer_blocks' }))
        expect(() => validateAndNormalizeFAQInput({ ...validInput, answerBlocks: ['   '] })).toThrow(
            expect.objectContaining({ code: 'answer_block_required' })
        )
        expect(() =>
            validateAndNormalizeFAQInput({
                ...validInput,
                answerBlocks: ['答'.repeat(KNOWLEDGE_FAQ_ANSWER_TOTAL_MAX_LENGTH), '案']
            })
        ).toThrow(expect.objectContaining({ code: 'answer_too_long' }))
    })

    it('rejects duplicate questions inside the same FAQ after normalization', () => {
        expect(() =>
            validateAndNormalizeFAQInput({
                ...validInput,
                standardQuestion: ' ＨＥＬＬＯ  World ',
                similarQuestions: ['hello\nworld']
            })
        ).toThrow(expect.objectContaining({ code: 'duplicate_question' }))
    })

    it('rejects a question already used by another enabled or disabled FAQ', () => {
        const candidate = validateAndNormalizeFAQInput(validInput)
        const existing = [
            {
                id: 'faq-disabled',
                standardQuestion: '别的问题',
                similarQuestions: [' 忘记密码怎么办? '],
                enabled: false
            }
        ]

        expect(() => assertFAQQuestionUniqueness(candidate, existing)).toThrow(
            expect.objectContaining({
                code: 'duplicate_question',
                conflictingFAQId: 'faq-disabled'
            })
        )
    })

    it('can exclude the current FAQ during update validation', () => {
        const candidate = validateAndNormalizeFAQInput(validInput)
        expect(() =>
            assertFAQQuestionUniqueness(
                candidate,
                [
                    {
                        id: 'faq-current',
                        standardQuestion: validInput.standardQuestion,
                        similarQuestions: validInput.similarQuestions,
                        enabled: true
                    }
                ],
                'faq-current'
            )
        ).not.toThrow()
    })

    it('exposes a typed validation error for API translation', () => {
        try {
            validateAndNormalizeFAQInput({ ...validInput, standardQuestion: '' })
            throw new Error('expected validation failure')
        } catch (error) {
            expect(error).toBeInstanceOf(FAQInputValidationError)
            expect(error).toMatchObject({ code: 'standard_question_required', field: 'standardQuestion' })
        }
    })
})
