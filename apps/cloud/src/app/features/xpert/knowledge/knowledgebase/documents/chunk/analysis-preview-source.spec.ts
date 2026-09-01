import { isDocxAnalysisSource } from './analysis-preview-source'

describe('isDocxAnalysisSource', () => {
  it.each([
    ['DOCX', undefined, 'notice'],
    [undefined, 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'notice'],
    [undefined, undefined, 'technical-notice.DOCX']
  ])('recognizes DOCX by type, MIME type, or file extension', (sourceType, sourceMimeType, fileName) => {
    expect(isDocxAnalysisSource(sourceType, sourceMimeType, fileName)).toBe(true)
  })

  it('does not identify PDF files as DOCX', () => {
    expect(isDocxAnalysisSource('pdf', 'application/pdf', 'notice.pdf')).toBe(false)
  })
})
