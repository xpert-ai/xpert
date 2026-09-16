import { rethrowParserError } from './parser-error'
jest.mock('i18next', () => ({ t: (_key: string, options: { defaultValue: string }) => options.defaultValue }))
it.each([
    ['MARKITDOWN_EMPTY_FILE', 'uploaded file is empty'],
    ['MARKITDOWN_EMPTY_TEXT', 'No readable text'],
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
