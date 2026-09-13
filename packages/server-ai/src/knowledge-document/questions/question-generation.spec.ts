import {
    parseGeneratedQuestions,
    questionSourceHash,
    questionInputHash,
    questionVectorId,
    questionMessages
} from './question-generation'

describe('question generation', () => {
    it('invalidates question vectors when the searchable source fields change', () => {
        const source = { pageContent: 'Full row', metadata: { chunkId: 'row', searchContent: 'Indexed field A' } }
        expect(questionSourceHash(source)).not.toBe(
            questionSourceHash({
                ...source,
                metadata: { ...source.metadata, searchContent: 'Indexed field B' }
            })
        )
    })

    it('accepts only a structured question array and removes duplicate or empty questions', () => {
        expect(
            parseGeneratedQuestions('{"questions":["How to apply?","How to apply?"," ","Which documents?"]}', 3)
        ).toEqual(['How to apply?', 'Which documents?'])
        expect(() => parseGeneratedQuestions('Here are some questions:', 3)).toThrow()
        expect(() => parseGeneratedQuestions('{"questions":[12]}', 3)).toThrow()
        expect(() => parseGeneratedQuestions('{"questions":[" "]}', 3)).toThrow()
        expect(parseGeneratedQuestions('{"questions":[]}', 3)).toEqual([])
    })

    it('keeps wrapper fields out of search questions and permits meaningful abstention', () => {
        const [rules, data] = questionMessages('Source facts', 'Parent context', 'fixture.txt', { enabled: true })
        expect(rules.content).toContain('transport fields, not source content')
        expect(rules.content).toContain('word counts, repeated words, filenames, JSON fields')
        expect(rules.content).toContain('{"questions":[]}')
        expect(JSON.parse(data.content)).toEqual({
            documentName: 'fixture.txt',
            source: 'Source facts',
            context: 'Parent context'
        })
    })

    it('invalidates questions when source text, parent context, or generation settings change', () => {
        const source = { pageContent: 'Original', metadata: { chunkId: 'chunk' } }
        const config = { enabled: true, questionCount: 3 }
        expect(questionSourceHash(source)).not.toBe(questionSourceHash({ ...source, pageContent: 'Edited' }))
        expect(questionInputHash(source, 'Parent A', config)).not.toBe(questionInputHash(source, 'Parent B', config))
        expect(questionInputHash(source, '', config)).not.toBe(
            questionInputHash(source, '', { ...config, questionCount: 5 })
        )
    })

    it('keeps derived vector ids deterministic within one generation and isolates replacements', () => {
        expect(questionVectorId('chunk', 'generation', 'q1')).toBe(questionVectorId('chunk', 'generation', 'q1'))
        expect(questionVectorId('chunk', 'generation', 'q1')).not.toBe(
            questionVectorId('chunk', 'new-generation', 'q1')
        )
    })
})
