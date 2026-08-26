import type { BlockContent, Document } from '@eigenpal/docx-editor-core'

export const DOCX_MIME_TYPE = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'

export function isDocxEditorFile(filePath?: string | null) {
  return (filePath ?? '').split('.').pop()?.toLowerCase() === 'docx'
}

export function createDocxFile(buffer: ArrayBuffer, fileName: string, mimeType = DOCX_MIME_TYPE) {
  return new File([buffer], fileName || 'document.docx', {
    type: mimeType
  })
}

/**
 * The editor currently treats an `auto` table width as twips. Some Word
 * producers write a placeholder value (commonly 100) there and keep the real
 * width in `tblGrid`, which collapses the table in editing mode. Use that grid
 * as an explicit width so the editor and Word agree on the layout.
 */
export function normalizeDocxTableWidths(document: Document) {
  const normalizeBlocks = (blocks: BlockContent[]) => {
    for (const block of blocks) {
      if (block.type === 'table') {
        const gridWidth = block.columnWidths?.reduce((total, width) => total + Math.max(0, width), 0) ?? 0
        const declaredWidth = block.formatting?.width

        if (gridWidth > 0 && declaredWidth?.type === 'auto' && gridWidth > declaredWidth.value) {
          block.formatting = {
            ...block.formatting,
            width: { type: 'dxa', value: gridWidth }
          }
        }

        for (const row of block.rows) {
          for (const cell of row.cells) {
            normalizeBlocks(cell.content)
          }
        }
      } else if (block.type === 'blockSdt') {
        normalizeBlocks(block.content)
      }
    }
  }

  normalizeBlocks(document.package.document.content)
  document.package.headers?.forEach((header) => normalizeBlocks(header.content))
  document.package.footers?.forEach((footer) => normalizeBlocks(footer.content))
  document.package.footnotes?.forEach((footnote) => normalizeBlocks(footnote.content))
  document.package.endnotes?.forEach((endnote) => normalizeBlocks(endnote.content))

  return document
}
