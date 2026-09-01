const DOCX_MIME_TYPE = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'

/** Identifies DOCX sources when a transformer supplies only a type, MIME type, or file extension. */
export function isDocxAnalysisSource(sourceType?: string, sourceMimeType?: string, fileName = '') {
  return (
    sourceType?.trim().toLowerCase() === 'docx' ||
    sourceMimeType?.trim().toLowerCase() === DOCX_MIME_TYPE ||
    fileName.trim().toLowerCase().endsWith('.docx')
  )
}
