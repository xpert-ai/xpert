import { resolveParserDiagnostics, textWithoutImages } from './parser-diagnostics'

const diagnostics = {
    schemaVersion: 1,
    pages: [
        { page: 1, status: 'text', imagePaths: [] },
        { page: 2, status: 'needs-ocr', imagePaths: ['page2.png', 'page2-detail.png'] }
    ]
}
const ocr = (path: string, text = 'PAGE2-SCAN-862 385.50') => ({
    pageContent: text,
    metadata: { parser: 'vlm', imagePath: path }
})

it('keeps incomplete image coverage visible and requires every asset to be recognized', () => {
    expect(resolveParserDiagnostics([diagnostics], [ocr('page2.png')]).pages[1].status).toBe('needs-ocr')
    expect(resolveParserDiagnostics([diagnostics], [ocr('page2.png'), ocr('page2-detail.png')]).pages[1].status).toBe(
        'recognized'
    )
    expect(diagnostics.pages[1].status).toBe('needs-ocr')
})
it('does not count placeholders, empty responses, unreadable text or unrelated images as OCR', () => {
    for (const text of ['', '![page](https://example.test/page.png)', '[unreadable]']) {
        expect(
            resolveParserDiagnostics([diagnostics], [ocr('page2.png', text), ocr('page2-detail.png')]).pages[1].status
        ).toBe('needs-ocr')
    }
    expect(resolveParserDiagnostics([diagnostics], [ocr('another.png')]).pages[1].status).toBe('needs-ocr')
    expect(textWithoutImages('![page](https://example.test/page.png)')).toBe('')
})
it('accepts legacy documents and rejects malformed provider diagnostics', () => {
    expect(resolveParserDiagnostics([undefined, { schemaVersion: 1, pages: [{ page: -1 }] }], [])).toBeUndefined()
})
it('recomputes coverage instead of reusing stale success from a previous run', () => {
    const previous = resolveParserDiagnostics([diagnostics], [ocr('page2.png'), ocr('page2-detail.png')])
    expect(resolveParserDiagnostics([previous], []).pages[1].status).toBe('needs-ocr')
})

it('does not hide an unreadable span in another chunk of the same page image', () => {
    expect(
        resolveParserDiagnostics(
            [diagnostics],
            [ocr('page2.png'), ocr('page2.png', '[unreadable]'), ocr('page2-detail.png')]
        ).pages[1].status
    ).toBe('needs-ocr')
})
