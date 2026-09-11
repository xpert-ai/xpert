import { Document } from '@langchain/core/documents'
import type { ChunkMetadata } from '@xpert-ai/plugin-sdk'
import { detectChunkLanguage, LANGUAGE_SAMPLE_CODE_UNITS } from './chunk-language'
import { sentenceRanges } from '../knowledgebase/plugins/textsplitter-common/language-boundaries'

const source = (pageContent: string) =>
    new Document<ChunkMetadata>({
        pageContent,
        metadata: { chunkId: 'source', contentFormat: 'markdown' }
    })

describe('bounded natural-language detection', () => {
    it.each([
        [
            '\u77e5\u8bc6\u5e93\u652f\u6301\u6587\u6863\u5207\u7247\u3002\u8fd9\u662f\u4e00\u4efd\u4e2d\u6587\u8bf4\u660e\u3002',
            'Chinese'
        ],
        ['The document describes how to configure a knowledge base. Keep the original text.', 'English'],
        [
            '\u901a\u8fc7 API LLM MCP HTTP JSON REST SDK SQL \u914d\u7f6e\u8bf7\u6c42\u3002\u6b63\u6587\u4fdd\u6301\u4e2d\u6587\u3002',
            'Chinese'
        ],
        ['This document explains the configuration and includes the term \u4e2d\u6587 for reference.', 'English'],
        ['\u8fd9\u662f\u4e2d\u6587\u6bb5\u843d\u3002\n\nThis is an English paragraph.', 'Mixed'],
        ['123456789 100.01\n\nhttps://example.com/english/only\n\n$$ x = alphabet $$', undefined]
    ])('classifies natural units and then votes: %#', (text, language) => {
        expect(detectChunkLanguage([source(text)]).detectedLanguage).toBe(language)
    })

    it('ignores fenced code, inline code, formulas, tables and link destinations, including code inside lists', () => {
        const noise = 'This is an English sentence. '.repeat(60)
        const text =
            `# \u4e2d\u6587\u6807\u9898\n\n\u6b63\u6587\u4ecb\u7ecd\u77e5\u8bc6\u5e93\u3002\n\n\`\`\`js\n${noise}\n\`\`\`\n\n` +
            `- \u4e2d\u6587\u5217\u8868\u5185\u5bb9\u3002\n\n    \`\`\`js\n    ${noise}\n    \`\`\`\n\n` +
            `\u8bf7\u9605\u8bfb[\u8bf4\u660e](https://example.com/english/path)\uff0c\u5ffd\u7565 \`${noise}\` \u548c $alpha + beta$\u3002\n\n` +
            `$$\n${noise}\n$$\n\n| English | Values |\n| --- | --- |\n| ${noise} | ${noise} |`
        expect(detectChunkLanguage([source(text)]).detectedLanguage).toBe('Chinese')
    })

    it.each(['\u3002', '\uff01', '\uff1f', '\uff1b', '\uff0c', '\u3001'])(
        'retains Chinese prose immediately after a URL and CJK punctuation: %s',
        (punctuation) => {
            const prose = '\u4e2d\u6587\u6b63\u6587\u4ecb\u7ecd\u914d\u7f6e\u6b65\u9aa4\u3002'.repeat(5)
            const result = detectChunkLanguage([source('# API Guide\n\nhttps://example.com' + punctuation + prose)])
            expect(result.detectedLanguage).toBe('Chinese')
            expect(result.naturalUnits).toBeGreaterThanOrEqual(6)
        }
    )

    it('does not let the absolute length of a Latin word outvote Chinese prose', () => {
        const term = 'Internationalization'.repeat(20)
        expect(
            detectChunkLanguage([
                source(`\u4e2d\u6587\u6b63\u6587\u4ecb\u7ecd ${term} \u7684\u4f7f\u7528\u65b9\u6cd5\u3002`)
            ]).detectedLanguage
        ).toBe('Chinese')
    })

    it('does not interpret dollar strings inside code as formula delimiters for the following prose', () => {
        const text = '```js\nconst marker = "$$";\n```\n\n\u8fd9\u662f\u4e2d\u6587\u6b63\u6587\u3002'
        expect(detectChunkLanguage([source(text)]).detectedLanguage).toBe('Chinese')
    })

    it('bounds source reads and parsing even for a multi-megabyte document', () => {
        const text = '\u8fd9\u662f\u4e2d\u6587\u6bb5\u843d\u3002'.repeat(500_000)
        const result = detectChunkLanguage([
            source(text),
            {
                get pageContent(): string {
                    throw new Error('must not read beyond the sample budget')
                },
                metadata: { chunkId: 'later' }
            }
        ])
        expect(result.sampledCodeUnits).toBe(LANGUAGE_SAMPLE_CODE_UNITS)
        expect(Buffer.byteLength(text.slice(0, result.sampledCodeUnits))).toBeLessThanOrEqual(64 * 1024)
        expect(result.detectedLanguage).toBe('Chinese')
    })

    it('does not mistake an unfinished code fence at the sampling boundary for prose', () => {
        const result = detectChunkLanguage([
            source('```text\n' + 'English source code. '.repeat(5000) + '\n```\n\u4e2d\u6587')
        ])
        expect(result.sampledCodeUnits).toBe(LANGUAGE_SAMPLE_CODE_UNITS)
        expect(result.naturalUnits).toBe(0)
        expect(result.detectedLanguage).toBeUndefined()
    })

    it('samples the whole small document across source fragments', () => {
        const documents = [source('\u4e2d\u6587\u5185\u5bb9\u3002'), source('This is English content.')]
        const result = detectChunkLanguage(documents)
        expect(result.sampledCodeUnits).toBe(documents.reduce((sum, doc) => sum + doc.pageContent.length, 0))
        expect(result.detectedLanguage).toBe('Mixed')
    })

    it('ignores formulas that exceed the sample budget, and layout blocks explicitly marked as formulas', () => {
        expect(detectChunkLanguage([source('$$\n' + 'alpha + beta '.repeat(10000) + '\n$$')]).naturalUnits).toBe(0)
        const formula = source('alpha beta gamma')
        formula.metadata.documentLayout = {
            schemaVersion: 1,
            type: 'formula',
            blockId: 'formula',
            page: 1,
            pageWidth: 600,
            pageHeight: 800,
            order: 0
        }
        expect(detectChunkLanguage([formula, source('\u4e2d\u6587\u6b63\u6587\u3002')]).detectedLanguage).toBe(
            'Chinese'
        )
    })
})

describe('sentence boundaries', () => {
    it('adds Chinese semicolon boundaries without damaging text or quoted sentence endings', () => {
        const text = '\u7b2c\u4e00\u53e5\uff1b\u7b2c\u4e8c\u53e5\u3002\u201d\u7b2c\u4e09\u53e5\uff01'
        const parts = sentenceRanges(text, 'Chinese').map((range) => text.slice(range.start, range.end))
        expect(parts[0]).toBe('\u7b2c\u4e00\u53e5\uff1b')
        expect(parts).toContain('\u7b2c\u4e8c\u53e5\u3002\u201d')
        expect(parts.join('')).toBe(text)
    })

    it('protects inline code, formulas and URLs from newly introduced language boundaries', () => {
        const text = 'Read `a; b. C` and $a; b$ at https://example.com/a;b before proceeding. Then continue.'
        const parts = sentenceRanges(text, 'Mixed').map((range) => text.slice(range.start, range.end))
        expect(parts).toHaveLength(2)
        expect(parts[0]).toContain('https://example.com/a;b')
    })

    it('retains Chinese sentence boundaries after a bare URL without whitespace', () => {
        const url = 'https://example.com/a;b'
        const prose = '\u7b2c\u4e00\u53e5\u4e2d\u6587\u3002\u7b2c\u4e8c\u53e5\u4e2d\u6587\uff01'
        const text = url + '\u3002' + prose
        const parts = sentenceRanges(text, 'Chinese').map((range) => text.slice(range.start, range.end))
        expect(parts).toEqual([
            url + '\u3002',
            '\u7b2c\u4e00\u53e5\u4e2d\u6587\u3002',
            '\u7b2c\u4e8c\u53e5\u4e2d\u6587\uff01'
        ])
        expect(parts.join('')).toBe(text)
    })

    it('keeps international URL paths and explicit Markdown links protected', () => {
        const url = 'https://\u4f8b\u5b50.\u6d4b\u8bd5/\u6587\u6863;a?x=1'
        const link = '[\u8bf4\u660e](https://example.com/\u8def\u5f84\u3002\u7ec8\u70b9)'
        const text = url + '\u3002' + link + '\u3002'
        const parts = sentenceRanges(text, 'Chinese').map((range) => text.slice(range.start, range.end))
        expect(parts).toEqual([url + '\u3002', link + '\u3002'])
    })

    it('has a deterministic fallback when Intl.Segmenter is unavailable', () => {
        const original = Object.getOwnPropertyDescriptor(Intl, 'Segmenter')
        try {
            Object.defineProperty(Intl, 'Segmenter', { value: undefined, configurable: true })
            expect(sentenceRanges('One sentence. Another sentence!', 'English')).toHaveLength(2)
            expect(sentenceRanges('\u4e00\u53e5\u3002\u4e8c\u53e5\uff1b\u4e09\u53e5\uff01', 'Chinese')).toHaveLength(3)
        } finally {
            Object.defineProperty(Intl, 'Segmenter', original)
        }
    })
})
