import { rethrowParserError } from './parser-error'
jest.mock('i18next', () => ({ t: (_key: string, options: { defaultValue: string }) => options.defaultValue }))
it.each([
    ['MARKITDOWN_EMPTY_FILE', 'uploaded file is empty'],
    ['MARKITDOWN_EMPTY_TEXT', 'No readable text'],
    ['ANYDOC_EMPTY_TEXT', 'No readable text'],
    ['ANYDOC_UNSUPPORTED_ENCODING', 'UTF-8'],
    ['MARKITDOWN_INVALID_DOCUMENT', 'damaged, encrypted'],
    ['MARKITDOWN_INPUT_TOO_LARGE', '100 MB'],
    ['MARKITDOWN_OUTPUT_TOO_LARGE', 'output limit']
])('translates %s at the host boundary', (code, text) => {
    expect(() => rethrowParserError(new Error(code))).toThrow(text)
})
it('preserves unrelated errors without guessing from a substring', () => {
    const error = new Error('Job failed for another reason')
    expect(() => rethrowParserError(error)).toThrow(error)
})

it.each(['ANYDOC', 'OPENDATALOADER'])('translates %s errors with useful OCR and runtime guidance', (prefix) => {
    expect(() => rethrowParserError(new Error(`${prefix}_NEEDS_OCR`))).toThrow('require OCR')
    expect(() => rethrowParserError(new Error(`${prefix}_ENCRYPTED`))).toThrow('unencrypted')
    expect(() => rethrowParserError(new Error(`${prefix}_INCOMPLETE_PAGES`))).toThrow('all PDF pages')
    expect(() => rethrowParserError(new Error(`${prefix}_RUNTIME_INVALID`))).toThrow('administrator')
})

it.each(['ANYDOC_NEEDS_OCR', 'OPENDATALOADER_INCOMPLETE_PAGES', 'OPENDATALOADER_OCR_FAILED'])(
    'retains bounded page evidence for %s',
    (code) => {
        const error = Object.assign(new Error(code), { pages: [3, 2, 3] })
        expect(() => rethrowParserError(error)).toThrow('Affected pages (up to 100): 2, 3.')
    }
)

it.each([[0], ['token'], [10001], Array(101).fill(1)].map((pages) => [pages]))(
    'does not expose invalid page evidence: %j',
    (pages) => {
        const error = Object.assign(new Error('ANYDOC_NEEDS_OCR'), { pages })
        try {
            rethrowParserError(error)
        } catch (translated) {
            expect(translated.message).toContain('require OCR')
            expect(translated.message).not.toContain('Affected pages')
        }
    }
)
