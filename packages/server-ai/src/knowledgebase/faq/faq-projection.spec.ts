import { DEFAULT_KNOWLEDGEBASE_FAQ_CONFIG, KnowledgebaseFAQConfig, KnowledgebaseTypeEnum } from '@xpert-ai/contracts'
import {
    buildFAQKeywordProjection,
    buildFAQResultContent,
    buildFAQVectorProjections,
    normalizeFAQInput,
    normalizeFAQQuestion,
    createFAQLogicalVectorId
} from './faq-projection'
import { validate as validateUuid } from 'uuid'

describe('FAQ projections', () => {
    const input = {
        standardQuestion: '  如何 重置密码？  ',
        similarQuestions: ['忘记密码怎么办？', ' 怎样\n重设密码？ '],
        negativeQuestions: [' 如何修改用户名？ '],
        answerBlocks: ['打开设置页面。', '点击“重置密码”。'],
        enabled: true
    }

    it('normalizes question identity without destroying answer formatting', () => {
        expect(normalizeFAQQuestion(' ＨＥＬＬＯ\n World ')).toBe('hello world')
        expect(normalizeFAQInput(input)).toEqual({
            standardQuestion: '如何 重置密码？',
            similarQuestions: ['忘记密码怎么办？', '怎样 重设密码？'],
            negativeQuestions: ['如何修改用户名？'],
            answerBlocks: ['打开设置页面。', '点击“重置密码”。'],
            enabled: true
        })
    })

    it('builds one question-only vector when questions are combined', () => {
        const projections = buildFAQVectorProjections('faq-1', input, {
            indexMode: 'question_only',
            questionIndexMode: 'combined'
        })

        expect(projections).toEqual([
            {
                logicalId: createFAQLogicalVectorId('faq-1', 'combined'),
                key: 'combined',
                content: '如何 重置密码？\n忘记密码怎么办？\n怎样 重设密码？'
            }
        ])
    })

    it('indexes each question separately and indexes answer blocks once', () => {
        const projections = buildFAQVectorProjections('faq-1', input, {
            indexMode: 'question_answer',
            questionIndexMode: 'separate'
        })

        expect(projections).toEqual([
            {
                logicalId: createFAQLogicalVectorId('faq-1', 'question:0'),
                key: 'question:0',
                content: '如何 重置密码？'
            },
            {
                logicalId: createFAQLogicalVectorId('faq-1', 'question:1'),
                key: 'question:1',
                content: '忘记密码怎么办？'
            },
            {
                logicalId: createFAQLogicalVectorId('faq-1', 'question:2'),
                key: 'question:2',
                content: '怎样 重设密码？'
            },
            { logicalId: createFAQLogicalVectorId('faq-1', 'answer:0'), key: 'answer:0', content: '打开设置页面。' },
            { logicalId: createFAQLogicalVectorId('faq-1', 'answer:1'), key: 'answer:1', content: '点击“重置密码”。' }
        ])
        expect(projections.filter(({ content }) => content.includes('打开设置页面。'))).toHaveLength(1)
    })

    it('includes the answer once when question-and-answer content is combined', () => {
        const projections = buildFAQVectorProjections('faq-1', input, {
            indexMode: 'question_answer',
            questionIndexMode: 'combined'
        })

        expect(projections).toEqual([
            {
                logicalId: createFAQLogicalVectorId('faq-1', 'combined'),
                key: 'combined',
                content: '如何 重置密码？\n忘记密码怎么办？\n怎样 重设密码？\n\n打开设置页面。\n\n点击“重置密码”。'
            }
        ])
    })

    it('keeps keyword search content separate from the full FAQ result', () => {
        expect(buildFAQKeywordProjection(input, DEFAULT_KNOWLEDGEBASE_FAQ_CONFIG)).toBe(
            '如何 重置密码？\n忘记密码怎么办？\n怎样 重设密码？'
        )
        expect(
            buildFAQKeywordProjection(input, {
                indexMode: 'question_answer',
                questionIndexMode: 'separate'
            })
        ).toBe('如何 重置密码？\n忘记密码怎么办？\n怎样 重设密码？\n\n打开设置页面。\n\n点击“重置密码”。')
        expect(buildFAQResultContent(input)).toBe(
            '问题：如何 重置密码？\n\n相似问法：\n- 忘记密码怎么办？\n- 怎样 重设密码？\n\n回答：\n打开设置页面。\n\n点击“重置密码”。'
        )
        expect(buildFAQKeywordProjection(input, DEFAULT_KNOWLEDGEBASE_FAQ_CONFIG)).not.toContain('如何修改用户名')
        expect(buildFAQVectorProjections('faq-1', input, DEFAULT_KNOWLEDGEBASE_FAQ_CONFIG)).not.toEqual(
            expect.arrayContaining([expect.objectContaining({ content: '如何修改用户名？' })])
        )
        expect(buildFAQResultContent(input)).not.toContain('如何修改用户名')
    })

    it('keeps the projection API constrained to FAQ knowledgebase configuration', () => {
        const config: KnowledgebaseFAQConfig = {
            indexMode: 'question_only',
            questionIndexMode: 'separate'
        }
        expect(KnowledgebaseTypeEnum.FAQ).toBe('faq')
        expect(buildFAQVectorProjections('faq-1', input, config)).toHaveLength(3)
    })

    it('uses stable UUID vector ids accepted by PostgreSQL vector storage', () => {
        const first = createFAQLogicalVectorId('faq-1', 'question:0')
        expect(first).toBe(createFAQLogicalVectorId('faq-1', 'question:0'))
        expect(first).not.toBe(createFAQLogicalVectorId('faq-1', 'question:1'))
        expect(validateUuid(first)).toBe(true)
    })
})
