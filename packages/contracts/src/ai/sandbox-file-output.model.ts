import type { ChatTaskSummaryOutputKind } from '@xpert-ai/chatkit-types'

/** Display and validation formats for explicitly presented files; never automatic delivery policy. */
export type SandboxFileOutputRule = {
  extension: string
  kind: ChatTaskSummaryOutputKind
  mimeType: string
  format: 'docx' | 'xlsx' | 'pptx' | 'pdf' | 'json' | 'utf8' | 'png' | 'jpeg' | 'binary'
}

export const SANDBOX_FILE_OUTPUT_RULES: readonly SandboxFileOutputRule[] = [
  {
    extension: '.docx',
    kind: 'document',
    mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    format: 'docx'
  },
  {
    extension: '.xlsx',
    kind: 'spreadsheet',
    mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    format: 'xlsx'
  },
  {
    extension: '.pptx',
    kind: 'presentation',
    mimeType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    format: 'pptx'
  },
  { extension: '.pdf', kind: 'document', mimeType: 'application/pdf', format: 'pdf' },
  { extension: '.json', kind: 'file', mimeType: 'application/json', format: 'json' },
  { extension: '.md', kind: 'document', mimeType: 'text/markdown', format: 'utf8' },
  { extension: '.txt', kind: 'file', mimeType: 'text/plain', format: 'utf8' },
  { extension: '.csv', kind: 'spreadsheet', mimeType: 'text/csv', format: 'utf8' },
  { extension: '.tsv', kind: 'spreadsheet', mimeType: 'text/tab-separated-values', format: 'utf8' },
  { extension: '.html', kind: 'file', mimeType: 'text/html', format: 'utf8' },
  { extension: '.png', kind: 'image', mimeType: 'image/png', format: 'png' },
  { extension: '.jpg', kind: 'image', mimeType: 'image/jpeg', format: 'jpeg' },
  { extension: '.jpeg', kind: 'image', mimeType: 'image/jpeg', format: 'jpeg' },
  { extension: '.svg', kind: 'image', mimeType: 'image/svg+xml', format: 'utf8' }
]
