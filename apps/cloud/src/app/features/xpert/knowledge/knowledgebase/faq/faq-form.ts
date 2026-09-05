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

export type KnowledgeFAQFormValue = {
  standardQuestion: string
  similarQuestions: string[]
  negativeQuestions: string[]
  answerBlocks: string[]
  enabled: boolean
}

export type KnowledgeFAQFormValidationError =
  | 'standard_question_required'
  | 'standard_question_too_long'
  | 'too_many_similar_questions'
  | 'similar_question_too_long'
  | 'duplicate_question'
  | 'too_many_negative_questions'
  | 'negative_question_too_long'
  | 'duplicate_negative_question'
  | 'negative_question_conflicts_with_positive'
  | 'answer_required'
  | 'too_many_answer_blocks'
  | 'answer_total_too_long'

export function getKnowledgeFAQLength(value: string) {
  return Array.from(value).length
}

export function normalizeKnowledgeFAQFormValue(value: KnowledgeFAQFormValue): KnowledgeFAQWriteInput {
  return {
    standardQuestion: value.standardQuestion.trim(),
    similarQuestions: value.similarQuestions.map((question) => question.trim()).filter(Boolean),
    negativeQuestions: value.negativeQuestions.map((question) => question.trim()).filter(Boolean),
    answerBlocks: value.answerBlocks.map((answer) => answer.trim()).filter(Boolean),
    enabled: value.enabled
  }
}

export function validateKnowledgeFAQFormValue(value: KnowledgeFAQFormValue): KnowledgeFAQFormValidationError | null {
  const normalized = normalizeKnowledgeFAQFormValue(value)
  if (!normalized.standardQuestion) return 'standard_question_required'
  if (getKnowledgeFAQLength(normalized.standardQuestion) > KNOWLEDGE_FAQ_STANDARD_QUESTION_MAX_LENGTH) {
    return 'standard_question_too_long'
  }
  if ((normalized.similarQuestions?.length ?? 0) > KNOWLEDGE_FAQ_SIMILAR_QUESTION_MAX_COUNT) {
    return 'too_many_similar_questions'
  }
  if (
    normalized.similarQuestions?.some(
      (question) => getKnowledgeFAQLength(question) > KNOWLEDGE_FAQ_SIMILAR_QUESTION_MAX_LENGTH
    )
  ) {
    return 'similar_question_too_long'
  }

  const normalizedQuestions = [normalized.standardQuestion, ...(normalized.similarQuestions ?? [])].map(
    normalizeQuestionIdentity
  )
  if (new Set(normalizedQuestions).size !== normalizedQuestions.length) return 'duplicate_question'

  if ((normalized.negativeQuestions?.length ?? 0) > KNOWLEDGE_FAQ_NEGATIVE_QUESTION_MAX_COUNT) {
    return 'too_many_negative_questions'
  }
  if (
    normalized.negativeQuestions?.some(
      (question) => getKnowledgeFAQLength(question) > KNOWLEDGE_FAQ_NEGATIVE_QUESTION_MAX_LENGTH
    )
  ) {
    return 'negative_question_too_long'
  }

  const normalizedNegativeQuestions = (normalized.negativeQuestions ?? []).map(normalizeQuestionIdentity)
  if (new Set(normalizedNegativeQuestions).size !== normalizedNegativeQuestions.length) {
    return 'duplicate_negative_question'
  }
  const positiveQuestionSet = new Set(normalizedQuestions)
  if (normalizedNegativeQuestions.some((question) => positiveQuestionSet.has(question))) {
    return 'negative_question_conflicts_with_positive'
  }

  if (!normalized.answerBlocks.length) return 'answer_required'
  if (normalized.answerBlocks.length > KNOWLEDGE_FAQ_ANSWER_BLOCK_MAX_COUNT) return 'too_many_answer_blocks'
  if (
    normalized.answerBlocks.reduce((total, answer) => total + getKnowledgeFAQLength(answer), 0) >
    KNOWLEDGE_FAQ_ANSWER_TOTAL_MAX_LENGTH
  ) {
    return 'answer_total_too_long'
  }

  return null
}

function normalizeQuestionIdentity(question: string) {
  return question.normalize('NFKC').replace(/\s+/gu, ' ').trim().toLowerCase()
}
