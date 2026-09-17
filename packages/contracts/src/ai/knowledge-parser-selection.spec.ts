import {
  BUILTIN_KNOWLEDGE_FILE_TYPES,
  knowledgeDocumentFileType,
  knowledgeUploadFileTypes
} from './knowledge-parser-selection'
describe('knowledge document upload formats', () => {
  it('adds only declared plugin formats without granting builtin support', () => {
    expect(
      knowledgeUploadFileTypes(['pdf'], [{ supportedFileTypes: ['.RTF', 'application/msword', 'pdf', '../bad'] }])
    ).toEqual(['pdf', 'rtf', 'doc'])
    expect(BUILTIN_KNOWLEDGE_FILE_TYPES).not.toContain('rtf')
    expect(knowledgeUploadFileTypes(['pdf'], [])).toEqual(['pdf'])
  })
  it('preserves an explicit narrower caller restriction', () => {
    expect(knowledgeUploadFileTypes(['pdf'], [{ supportedFileTypes: ['rtf'] }], ['.DOCX'])).toEqual(['docx'])
  })
  it.each(['text/rtf', 'application/rtf', 'text/x-rtf', '.RTF'])('normalizes %s', (type) => {
    expect(knowledgeDocumentFileType({ type })).toBe('rtf')
  })
})
