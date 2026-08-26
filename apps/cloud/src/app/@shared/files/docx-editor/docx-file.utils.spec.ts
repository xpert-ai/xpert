import type { Document } from '@eigenpal/docx-editor-core'
import { normalizeDocxTableWidths } from './docx-file.utils'

describe('normalizeDocxTableWidths', () => {
  it('uses the table grid when an auto width placeholder would collapse the table', () => {
    const document = createDocument({ type: 'auto', value: 100 })

    normalizeDocxTableWidths(document)

    expect(document.package.document.content[0]).toMatchObject({
      formatting: { width: { type: 'dxa', value: 9000 } }
    })
  })

  it('keeps an explicit table width unchanged', () => {
    const document = createDocument({ type: 'dxa', value: 7200 })

    normalizeDocxTableWidths(document)

    expect(document.package.document.content[0]).toMatchObject({
      formatting: { width: { type: 'dxa', value: 7200 } }
    })
  })
})

function createDocument(width: { type: 'auto' | 'dxa'; value: number }) {
  return {
    package: {
      document: {
        content: [
          {
            type: 'table',
            formatting: { width },
            columnWidths: [1200, 3600, 2400, 1800],
            rows: []
          }
        ]
      }
    }
  } as Document
}
