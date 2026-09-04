import { getKnowledgeFAQLength, normalizeKnowledgeFAQFormValue, validateKnowledgeFAQFormValue } from './faq-form'

describe('knowledge FAQ form helpers', () => {
  it('counts Unicode code points instead of UTF-16 code units', () => {
    expect(getKnowledgeFAQLength('a😀中')).toBe(3)
  })

  it('normalizes surrounding whitespace without changing answer block structure', () => {
    expect(
      normalizeKnowledgeFAQFormValue({
        standardQuestion: '  How do I reset it?  ',
        similarQuestions: [' Reset steps? ', '   '],
        negativeQuestions: [' Account deletion? ', '   '],
        answerBlocks: [' First step\nSecond step ', ' More details '],
        enabled: true
      })
    ).toEqual({
      standardQuestion: 'How do I reset it?',
      similarQuestions: ['Reset steps?'],
      negativeQuestions: ['Account deletion?'],
      answerBlocks: ['First step\nSecond step', 'More details'],
      enabled: true
    })
  })

  it('rejects duplicate questions across the standard and similar questions', () => {
    expect(
      validateKnowledgeFAQFormValue({
        standardQuestion: 'How do I reset it?',
        similarQuestions: ['  HOW DO I RESET IT? '],
        negativeQuestions: [],
        answerBlocks: ['Follow these steps.'],
        enabled: true
      })
    ).toBe('duplicate_question')
  })

  it('rejects duplicate negative questions and conflicts with positive questions', () => {
    expect(
      validateKnowledgeFAQFormValue({
        standardQuestion: 'How do I reset it?',
        similarQuestions: [],
        negativeQuestions: ['Wrong topic', ' wrong   topic '],
        answerBlocks: ['Follow these steps.'],
        enabled: true
      })
    ).toBe('duplicate_negative_question')

    expect(
      validateKnowledgeFAQFormValue({
        standardQuestion: 'How do I reset it?',
        similarQuestions: ['Reset steps?'],
        negativeQuestions: ['  RESET STEPS? '],
        answerBlocks: ['Follow these steps.'],
        enabled: true
      })
    ).toBe('negative_question_conflicts_with_positive')
  })

  it('enforces negative question count and per-item limits', () => {
    expect(
      validateKnowledgeFAQFormValue({
        standardQuestion: 'Question',
        similarQuestions: [],
        negativeQuestions: Array.from({ length: 11 }, (_, index) => `Negative ${index}`),
        answerBlocks: ['Answer'],
        enabled: true
      })
    ).toBe('too_many_negative_questions')

    expect(
      validateKnowledgeFAQFormValue({
        standardQuestion: 'Question',
        similarQuestions: [],
        negativeQuestions: ['n'.repeat(501)],
        answerBlocks: ['Answer'],
        enabled: true
      })
    ).toBe('negative_question_too_long')
  })

  it('enforces the total answer limit across answer blocks', () => {
    expect(
      validateKnowledgeFAQFormValue({
        standardQuestion: 'Question',
        similarQuestions: [],
        negativeQuestions: [],
        answerBlocks: ['a'.repeat(6_000), 'b'.repeat(4_001)],
        enabled: true
      })
    ).toBe('answer_total_too_long')
  })

  it('accepts the maximum supported FAQ shape', () => {
    expect(
      validateKnowledgeFAQFormValue({
        standardQuestion: 'q'.repeat(500),
        similarQuestions: Array.from({ length: 10 }, (_, index) => `${index}-${'s'.repeat(497)}`),
        negativeQuestions: Array.from({ length: 10 }, (_, index) => `${index}-${'n'.repeat(497)}`),
        answerBlocks: Array.from({ length: 5 }, () => 'a'.repeat(2_000)),
        enabled: false
      })
    ).toBeNull()
  })
})
