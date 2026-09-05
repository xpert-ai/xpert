import {
    IKnowledgeFAQChunkMetadata,
    KnowledgebaseFAQConfig,
    KnowledgeFAQVectorKey,
    KnowledgeFAQWriteInput
} from '@xpert-ai/contracts'
import { v5 as uuidv5 } from 'uuid'

const FAQ_VECTOR_ID_NAMESPACE = '48a58865-48c2-458b-8a3e-d40d2d6fdd11'

export type NormalizedFAQInput = {
    standardQuestion: string
    similarQuestions: string[]
    negativeQuestions: string[]
    answerBlocks: string[]
    enabled: boolean
}

export type FAQVectorProjection = {
    logicalId: string
    key: KnowledgeFAQVectorKey
    content: string
}

function isStringArray(value: unknown): value is string[] {
    return Array.isArray(value) && value.every((item) => typeof item === 'string')
}

export function isKnowledgeFAQChunkMetadata(value: unknown): value is IKnowledgeFAQChunkMetadata {
    if (!value || typeof value !== 'object') return false
    return (
        'contentKind' in value &&
        value.contentKind === 'faq' &&
        'chunkId' in value &&
        typeof value.chunkId === 'string' &&
        'standardQuestion' in value &&
        typeof value.standardQuestion === 'string' &&
        'similarQuestions' in value &&
        isStringArray(value.similarQuestions) &&
        (!('negativeQuestions' in value) ||
            value.negativeQuestions === undefined ||
            isStringArray(value.negativeQuestions)) &&
        'answerBlocks' in value &&
        isStringArray(value.answerBlocks) &&
        'enabled' in value &&
        typeof value.enabled === 'boolean' &&
        'faqVectorIds' in value &&
        isStringArray(value.faqVectorIds)
    )
}

export function createFAQLogicalVectorId(faqId: string, key: string) {
    return uuidv5(`${faqId}:${key}`, FAQ_VECTOR_ID_NAMESPACE)
}

export function normalizeFAQQuestion(value: string) {
    return value.normalize('NFKC').trim().replace(/\s+/gu, ' ').toLowerCase()
}

function normalizeQuestionContent(value: string) {
    return value.trim().replace(/\s+/gu, ' ')
}

export function normalizeFAQInput(input: KnowledgeFAQWriteInput): NormalizedFAQInput {
    return {
        standardQuestion: normalizeQuestionContent(input.standardQuestion),
        similarQuestions: (input.similarQuestions ?? []).map(normalizeQuestionContent),
        negativeQuestions: (input.negativeQuestions ?? []).map(normalizeQuestionContent),
        answerBlocks: input.answerBlocks.map((answer) => answer.trim()),
        enabled: input.enabled ?? true
    }
}

function buildQuestionContent(input: NormalizedFAQInput) {
    return [input.standardQuestion, ...input.similarQuestions].join('\n')
}

function buildAnswerContent(input: NormalizedFAQInput) {
    return input.answerBlocks.join('\n\n')
}

export function buildFAQKeywordProjection(input: KnowledgeFAQWriteInput, config: KnowledgebaseFAQConfig) {
    const normalized = normalizeFAQInput(input)
    const questions = buildQuestionContent(normalized)
    return config.indexMode === 'question_answer' ? `${questions}\n\n${buildAnswerContent(normalized)}` : questions
}

export function buildFAQVectorProjections(
    faqId: string,
    input: KnowledgeFAQWriteInput,
    config: KnowledgebaseFAQConfig
): FAQVectorProjection[] {
    const normalized = normalizeFAQInput(input)
    if (config.questionIndexMode === 'combined') {
        return [
            {
                logicalId: createFAQLogicalVectorId(faqId, 'combined'),
                key: 'combined',
                content: buildFAQKeywordProjection(normalized, config)
            }
        ]
    }

    const questions = [normalized.standardQuestion, ...normalized.similarQuestions]
    const projections: FAQVectorProjection[] = questions.map((content, index) => ({
        logicalId: createFAQLogicalVectorId(faqId, `question:${index}`),
        key: `question:${index}`,
        content
    }))
    if (config.indexMode === 'question_answer') {
        projections.push(
            ...normalized.answerBlocks.map((content, index) => ({
                logicalId: createFAQLogicalVectorId(faqId, `answer:${index}`),
                key: `answer:${index}` as const,
                content
            }))
        )
    }
    return projections
}

export function buildFAQResultContent(input: KnowledgeFAQWriteInput) {
    const normalized = normalizeFAQInput(input)
    const similarQuestions = normalized.similarQuestions.length
        ? `\n\n相似问法：\n${normalized.similarQuestions.map((question) => `- ${question}`).join('\n')}`
        : ''
    return `问题：${normalized.standardQuestion}${similarQuestions}\n\n回答：\n${buildAnswerContent(normalized)}`
}
