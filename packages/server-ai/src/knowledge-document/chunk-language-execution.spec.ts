jest.mock('@xpert-ai/plugin-sdk', () => ({
    ...jest.requireActual('../../../plugin-sdk/src/lib/ai-model/utils/tokenizer'),
    TextSplitterStrategy: () => () => undefined
}))

import { Document } from '@langchain/core/documents'
import { KnowledgeStructureEnum, type KnowledgeChunkLanguageHint } from '@xpert-ai/contracts'
import { countTextTokens, type ChunkMetadata } from '@xpert-ai/plugin-sdk'
import * as language from './chunk-language'
import {
    executeKnowledgeSplitter,
    resolveKnowledgeLanguage,
    type KnowledgeSplitterExecutionContext
} from './execute-splitter'
import { splitKnowledgeDocuments } from './split-documents'
import { RecursiveCharacterStrategy } from '../knowledgebase/plugins/textsplitter-common/recursive-character.strategy'
import { MarkdownRecursiveStrategy } from '../knowledgebase/plugins/textsplitter-common/markdown-recursive.strategy'
import { StructureAwareStrategy } from '../knowledgebase/plugins/textsplitter-common/structure-aware.strategy'
import { AutoTextSplitterStrategy } from '../knowledgebase/plugins/textsplitter-common/auto.strategy'
import { ParentChildStrategy } from '../knowledgebase/plugins/textsplitter-common/parent-child.strategy'

const recursive = new RecursiveCharacterStrategy()
const markdown = new MarkdownRecursiveStrategy()
const structured = new StructureAwareStrategy(recursive)
const auto = new AutoTextSplitterStrategy(structured, markdown, recursive)
const source = (pageContent: string, documentId = 'doc') =>
    new Document<ChunkMetadata>({
        pageContent,
        metadata: { chunkId: 'source', documentId, contentFormat: 'markdown' }
    })
const texts = (result: Awaited<ReturnType<typeof executeKnowledgeSplitter>>) =>
    result.chunks.map((doc) => doc.pageContent)

afterEach(() => jest.restoreAllMocks())

it.each([auto, structured, recursive])(
    'keeps implicit separator defaults out of $meta.name pipeline forms',
    (strategy) => {
        expect(strategy.meta.configSchema.properties.separators).not.toHaveProperty('default')
    }
)

it('detects once for many fragments and chunks and separates explicit hints from actual detection', async () => {
    const spy = jest.spyOn(language, 'detectChunkLanguage')
    const docs = Array.from({ length: 10 }, () => source('This is the first sentence. This is the next sentence.'))
    const result = await executeKnowledgeSplitter(
        auto,
        docs,
        { chunkSize: 40, chunkOverlap: 0 },
        { languageHint: 'Chinese' }
    )
    expect(spy).toHaveBeenCalledTimes(1)
    expect(result.languages).toEqual([
        expect.objectContaining({ languageHint: 'Chinese', detectedLanguage: 'English', resolvedLanguage: 'Chinese' })
    ])
    expect(result.chunks.length).toBeGreaterThan(10)
})

it('reuses one detection across converter batches within the enclosing document execution', async () => {
    const spy = jest.spyOn(language, 'detectChunkLanguage')
    const docs = [source('\u4e2d\u6587\u6b63\u6587\u3002'), source('English content.')]
    const context: KnowledgeSplitterExecutionContext = {
        documentId: 'doc',
        languageDetection: resolveKnowledgeLanguage(recursive, docs)
    }
    const first = await executeKnowledgeSplitter(recursive, [docs[0]], {}, context)
    const second = await executeKnowledgeSplitter(recursive, [docs[1]], {}, context)
    expect(spy).toHaveBeenCalledTimes(1)
    expect(first.languages[0].detectedLanguage).toBe('Mixed')
    expect(second.languages[0].detectedLanguage).toBe('Mixed')
})

it('does not share a language vote between unrelated document identities', async () => {
    const spy = jest.spyOn(language, 'detectChunkLanguage')
    const result = await executeKnowledgeSplitter(
        auto,
        [source('\u4e2d\u6587\u5185\u5bb9\u3002', 'zh'), source('English content.', 'en')],
        {}
    )
    expect(spy).toHaveBeenCalledTimes(2)
    expect(result.languages.map((item) => item.resolvedLanguage)).toEqual(['Chinese', 'English'])
})

it.each([
    ['Plain natural text.', 'recursive-character'],
    ['# Heading\n\nNatural text.', 'markdown-recursive'],
    ['# Heading\n\n- First item\n- Second item', 'structure-aware']
])('never uses language to change Auto routing: %s', async (text, strategy) => {
    for (const languageHint of ['auto', 'Chinese', 'English'] as const) {
        const result = await executeKnowledgeSplitter(auto, [source(text)], {}, { languageHint })
        expect(result.decisions[0].resolvedStrategy).toBe(strategy)
    }
})

it.each([recursive, markdown, structured])('respects explicit separators with $meta.name', async (strategy) => {
    const doc = source('# Manual\n\nFirst; second; third; fourth; fifth; sixth; seventh; eighth; ninth; last.')
    const options = { chunkSize: 28, chunkOverlap: 0, separators: [';'] }
    const chinese = await executeKnowledgeSplitter(strategy, [doc], options, { languageHint: 'Chinese' })
    const english = await executeKnowledgeSplitter(strategy, [doc], options, { languageHint: 'English' })
    expect(texts(chinese)).toEqual(texts(english))
})

it.each([recursive, markdown, structured])(
    'splits long Chinese/English prose with hard token limits: $meta.name',
    async (strategy) => {
        for (const [languageHint, sentence] of [
            ['Chinese', '\u8fd9\u662f\u4e00\u4e2a\u81ea\u7136\u7684\u4e2d\u6587\u53e5\u5b50\u3002'],
            ['English', 'This is one natural English sentence. ']
        ] satisfies [KnowledgeChunkLanguageHint, string][]) {
            const result = await executeKnowledgeSplitter(
                strategy,
                [source('# Manual\n\n' + sentence.repeat(25))],
                { chunkSize: 120, chunkOverlap: 0 },
                { languageHint, maxChunkTokens: 48 }
            )
            expect(result.chunks.length).toBeGreaterThan(1)
            expect(result.chunks.every((chunk) => countTextTokens(chunk.pageContent) <= 48)).toBe(true)
            const prose = result.chunks.filter((chunk) => chunk.pageContent.includes(sentence.trim()))
            expect(prose.length).toBeGreaterThan(1)
            expect(prose.every((chunk) => /[.\u3002]$/.test(chunk.pageContent.trim()))).toBe(true)
        }
    }
)

it.each([recursive, markdown, structured])(
    'does not introduce language cuts into structural blocks: $meta.name',
    async (strategy) => {
        const table = '| A | B |\n| --- | --- |\n| x; y | z. |'
        const code = '```js\nconst x = "first; second. third";\n```'
        const formula = '$$\na; b = c.d\n$$'
        const list = '- first; second.\n- third; fourth.'
        const doc = source(['# Manual', table, code, formula, list].join('\n\n'))
        for (const languageHint of ['Chinese', 'English'] as const) {
            const result = await executeKnowledgeSplitter(
                strategy,
                [doc],
                { chunkSize: 80, chunkOverlap: 0 },
                { languageHint }
            )
            for (const block of [table, code, formula, list])
                expect(texts(result).some((text) => text.includes(block))).toBe(true)
        }
    }
)

it.each([recursive, markdown, structured, auto])(
    'preserves bracket formulas that fit the budget beside prose: $meta.name',
    async (strategy) => {
        const formula = '\\[\nalpha; beta; gamma; delta = epsilon\n\\]'
        const doc = source('Short introduction.\n\n' + formula + '\n\nClosing description.')
        for (const languageHint of ['Chinese', 'English'] as const) {
            const result = await executeKnowledgeSplitter(
                strategy,
                [doc],
                { chunkSize: 45, chunkOverlap: 0 },
                { languageHint }
            )
            expect(texts(result).some((text) => text.includes(formula))).toBe(true)
            if (strategy === auto) expect(result.decisions[0].resolvedStrategy).toBe('recursive-character')
        }
    }
)

it('preserves public configuration precedence and rejects invalid hints before executing', async () => {
    const registry = { get: () => recursive }
    const result = await splitKnowledgeDocuments(
        registry,
        { type: 'txt', parserConfig: { chunkLanguageHint: 'English', textSplitterType: 'recursive-character' } },
        [source('\u4e2d\u6587\u6b63\u6587\u3002')],
        { chunkLanguageHint: 'Chinese' }
    )
    expect(result.languages[0]).toMatchObject({
        languageHint: 'English',
        detectedLanguage: 'Chinese',
        resolvedLanguage: 'English'
    })
    const invalid = { languageHint: 'French' } as unknown as KnowledgeSplitterExecutionContext
    await expect(executeKnowledgeSplitter(recursive, [source('Text.')], {}, invalid)).rejects.toThrow()
})

it('defaults old configs to auto without mutating source documents or parser configs', async () => {
    const doc = source('\u4e2d\u6587\u6b63\u6587\u3002')
    const config = { chunkSize: 100, chunkOverlap: 0 }
    const before = JSON.stringify({ doc, config })
    const result = await executeKnowledgeSplitter(auto, [doc], config)
    expect(result.languages[0]).toMatchObject({ languageHint: 'auto', resolvedLanguage: 'Chinese' })
    expect(JSON.stringify({ doc, config })).toBe(before)
})

it('detects raw document prose once before whitespace preprocessing, just like the loader', async () => {
    const spy = jest.spyOn(language, 'detectChunkLanguage')
    const doc = source('\u4e2d\u6587\u6b63\u6587\n\nEnglish prose')
    doc.metadata.contentFormat = 'text'
    const result = await splitKnowledgeDocuments(
        { get: () => recursive },
        {
            type: 'txt',
            parserConfig: { textSplitterType: 'recursive-character', replaceWhitespace: true }
        },
        [doc]
    )
    expect(spy).toHaveBeenCalledTimes(1)
    expect(result.languages[0].detectedLanguage).toBe('Mixed')
})

it('preserves fenced code in plain text without changing the auto strategy', async () => {
    const code = '```js\nconst value = "a; b. C";\n```'
    const doc = source('An introductory sentence.\n\n' + code + '\n\n' + 'More prose. '.repeat(20))
    doc.metadata.contentFormat = 'text'
    const result = await executeKnowledgeSplitter(auto, [doc], { chunkSize: 60, chunkOverlap: 0 })
    expect(result.decisions[0].resolvedStrategy).toBe('recursive-character')
    expect(texts(result).some((text) => text.includes(code))).toBe(true)
})

it('does not invoke detection or alter the parent-child strategy', async () => {
    const spy = jest.spyOn(language, 'detectChunkLanguage')
    const parentChild = new ParentChildStrategy()
    expect(parentChild.structure).toBe(KnowledgeStructureEnum.ParentChild)
    const doc = source('First sentence. Second sentence. Third sentence.')
    const options = { parent: { maxChars: 100 }, child: { maxChars: 20 } }
    const first = await executeKnowledgeSplitter(parentChild, [doc], options, { languageHint: 'Chinese' })
    const second = await executeKnowledgeSplitter(parentChild, [doc], options, { languageHint: 'English' })
    expect(texts(first)).toEqual(texts(second))
    expect(spy).not.toHaveBeenCalled()
    expect(first.languages).toBeUndefined()
})
