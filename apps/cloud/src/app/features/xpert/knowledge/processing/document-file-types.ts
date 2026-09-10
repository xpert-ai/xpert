import type { IKnowledgeDocument } from '@xpert-ai/contracts'

// Uploads may carry a MIME subtype in `type`; remote documents use extensions.
const MIME_SUBTYPE_EXTENSIONS: { [subtype: string]: string } = {
  plain: 'txt',
  msword: 'doc',
  'vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
  'vnd.ms-word.document.macroenabled.12': 'docm',
  'vnd.openxmlformats-officedocument.presentationml.presentation': 'pptx',
  'vnd.ms-powerpoint': 'ppt',
  'vnd.ms-powerpoint.presentation.macroenabled.12': 'pptm',
  'vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
  'vnd.ms-excel': 'xls',
  'vnd.ms-excel.sheet.macroenabled.12': 'xlsm',
  'vnd.oasis.opendocument.presentation': 'odp',
  'vnd.oasis.opendocument.spreadsheet': 'ods',
  'vnd.oasis.opendocument.text': 'odt',
  'epub+zip': 'epub',
  'x-mimearchive': 'mhtml',
  rfc822: 'mhtml',
  'x-markdown': 'markdown',
  'x-png': 'png',
  mpeg: 'mp3',
  'x-wav': 'wav',
  'x-m4a': 'm4a',
  'x-flac': 'flac',
  'vnd.xmind.workbook': 'xmind'
}

export function documentFileType(document: Partial<Pick<IKnowledgeDocument, 'type' | 'mimeType'>>): string {
  const value = document.type && document.type !== 'unknown' ? document.type : document.mimeType
  const subtype = value?.split(';')[0].trim().toLowerCase().replace(/^.*\//, '').replace(/^\./, '') ?? ''
  return Object.prototype.hasOwnProperty.call(MIME_SUBTYPE_EXTENSIONS, subtype)
    ? MIME_SUBTYPE_EXTENSIONS[subtype]
    : subtype
}
